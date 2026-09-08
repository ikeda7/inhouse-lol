/**
 * =============================================================================
 * LCU  --  League Client Update API
 * =============================================================================
 *
 * ESTE E O CAMINHO QUE RESOLVE O PROBLEMA DOS CUSTOM GAMES.
 *
 * A API publica da Riot nao lista custom games em
 * `/lol/match/v5/matches/by-puuid/{puuid}/ids` -- e uma limitacao deliberada
 * dela, nao um bug nosso. Mas o CLIENTE do LoL, rodando na maquina de quem
 * jogou, mantem o proprio historico -- e nele os customs APARECEM.
 *
 * O cliente sobe um servidor HTTPS local (127.0.0.1, porta aleatoria) com
 * autenticacao Basic. Porta e senha ficam no arquivo `lockfile`, dentro da pasta
 * de instalacao. E a mesma porta que Blitz, Porofessor e OP.GG Desktop usam.
 *
 * O agente local (`companion/inhouse-companion.mjs`) le esse historico e faz
 * POST aqui. Este modulo so traduz o formato do LCU para o nosso.
 *
 * ATENCAO AO FORMATO: o LCU devolve o shape ANTIGO (estilo match-v4), diferente
 * do match-v5 usado em `riot.ts`:
 *   - as estatisticas ficam aninhadas em `participant.stats`, nao no topo;
 *   - o PUUID NAO esta no participant, e sim em `participantIdentities`,
 *     ligado por `participantId`;
 *   - a posicao vem de `participant.timeline.lane` + `.role`, nao de
 *     `teamPosition`;
 *   - o vencedor vem como a string "Win"/"Fail", nao booleano.
 * Por isso existe um mapper separado em vez de reaproveitar o de riot.ts.
 */

import { ROLES, type Role, type TeamSide } from './roles.js';
import { DraftError, type DraftablePlayer } from './autoBalance.js';

export class LcuError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'LcuError';
  }
}

// ---------------------------------------------------------------------------
// Shape do LCU (so os campos que usamos)
// ---------------------------------------------------------------------------

export interface LcuParticipantStats {
  kills?: number;
  deaths?: number;
  assists?: number;
  totalDamageDealtToChampions?: number;
  totalDamageTaken?: number;
  goldEarned?: number;
  visionScore?: number;
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
  win?: boolean;
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  largestKillingSpree?: number;
  largestMultiKill?: number;
  firstBloodKill?: boolean;
  firstBloodAssist?: boolean;
  killingSprees?: number;
  largestCriticalStrike?: number;
  champLevel?: number;
  goldSpent?: number;
  totalDamageDealt?: number;
  damageDealtToObjectives?: number;
  damageDealtToTurrets?: number;
  damageSelfMitigated?: number;
  totalHeal?: number;
  physicalDamageDealtToChampions?: number;
  magicDamageDealtToChampions?: number;
  trueDamageDealtToChampions?: number;
  timeCCingOthers?: number;
  longestTimeSpentLiving?: number;
  turretKills?: number;
  inhibitorKills?: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  visionWardsBoughtInGame?: number;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
  perk0?: number;
  perkPrimaryStyle?: number;
  perkSubStyle?: number;
  gameEndedInSurrender?: boolean;
}

export interface LcuParticipant {
  participantId: number;
  championId: number;
  /** So o .rofl preenche: ele guarda o NOME do campeao, nao o id numerico. */
  championName?: string;
  teamId: number; // 100 = azul, 200 = vermelho
  /** Feiticos de invocador. O 11 e Smite -- ver INFERENCIA POR SINAIS abaixo. */
  spell1Id?: number;
  spell2Id?: number;
  stats?: LcuParticipantStats;
  timeline?: { lane?: string; role?: string };
}

/** Id do feitico Smite. Em 5x5 sério, quem leva Smite é o jungler. */
const SMITE_SPELL_ID = 11;

export interface LcuParticipantIdentity {
  participantId: number;
  player?: {
    puuid?: string;
    gameName?: string;
    tagLine?: string;
    summonerName?: string;
  };
}

export interface LcuGame {
  gameId: number;
  platformId?: string;
  gameCreation?: number;
  gameCreationDate?: string;
  gameDuration?: number;
  gameType?: string;
  gameMode?: string;
  queueId?: number;
  mapId?: number;
  participants?: LcuParticipant[];
  participantIdentities?: LcuParticipantIdentity[];
  gameVersion?: string;
  teams?: {
    teamId: number;
    win?: string | boolean;
    towerKills?: number;
    inhibitorKills?: number;
    dragonKills?: number;
    baronKills?: number;
    riftHeraldKills?: number;
    /** Larvas do Vazio. O nome no payload e esse mesmo. */
    hordeKills?: number;
    firstBlood?: boolean;
    firstTower?: boolean;
    firstInhibitor?: boolean;
    firstBaron?: boolean;
    /** Sim, com erro de digitacao. E como o LCU manda. */
    firstDargon?: boolean;
    firstDragon?: boolean;
    bans?: { championId?: number; pickTurn?: number }[];
  }[];
}

// ---------------------------------------------------------------------------
// Mapa e modo
//
// O InHouse existe para o 5x5 na Fenda. ARAM e os modos rotativos entram com
// gameType CUSTOM_GAME igualzinho, entao SEM esta checagem um ARAM de 10
// pessoas passaria e estragaria a estatistica: la nao existe lane, o dano e o
// CS por minuto seguem outra escala, e o "winrate por role" viraria ficcao.
//
// Valores observados em partidas reais deste grupo:
//   mapId 11 + CLASSIC + queueId 3130 -> custom na Fenda, draft de torneio  (vale)
//   mapId 12 + KIWI    + queueId 3270 -> Abismo Uivante                     (nao vale)
// ---------------------------------------------------------------------------

/** Summoner's Rift. */
export const SUMMONERS_RIFT_MAP_ID = 11;

/** Modo padrao 5x5. Qualquer outro (ARAM, URF, KIWI...) fica de fora. */
export const ALLOWED_GAME_MODES = ['CLASSIC', 'TOURNAMENT'] as const;

/** Rotulos amigaveis para a mensagem de erro. */
const MAP_NAMES: Record<number, string> = {
  11: 'Summoner’s Rift',
  12: 'Abismo Uivante (ARAM)',
  21: 'Nexus Blitz',
  30: 'Arena',
};

// ---------------------------------------------------------------------------
// Resolucao de posicao
// ---------------------------------------------------------------------------

/**
 * Converte lane+role do LCU para a nossa role.
 *
 * O par (lane, role) e necessario porque a bot lane manda os dois jogadores com
 * `lane: BOTTOM`; quem separa ADC de Support e o `role`
 * (DUO_CARRY vs DUO_SUPPORT).
 */
function roleFromTimeline(timeline?: { lane?: string; role?: string }): Role | null {
  const lane = timeline?.lane?.toUpperCase();
  const duo = timeline?.role?.toUpperCase();

  switch (lane) {
    case 'TOP':
      return 'TOP';
    case 'JUNGLE':
      return 'JUNGLE';
    case 'MIDDLE':
    case 'MID':
      return 'MID';
    case 'BOTTOM':
    case 'BOT':
      if (duo === 'DUO_SUPPORT' || duo === 'SUPPORT') return 'SUPPORT';
      if (duo === 'DUO_CARRY' || duo === 'CARRY') return 'ADC';
      return null; // bot lane sem papel definido: ambiguo, resolve depois
    default:
      return null;
  }
}

/**
 * Garante 5 roles unicas num time.
 *
 * Em custom game o cliente erra a inferencia com frequencia (dois "MID", ou
 * lane vazia quando alguem trocou de rota). Em vez de gravar dado errado ou
 * desistir, resolvemos o que sobrou com o POOL DECLARADO dos jogadores --
 * reaproveitando a mesma maquinaria de emparelhamento do sorteio.
 *
 * Devolve tambem `inferred: false` quando precisou recorrer ao pool, para a UI
 * poder pedir confirmacao antes de gravar.
 */
/**
 * INFERENCIA POR SINAIS DA PARTIDA
 *
 * Em custom game o cliente quase nunca preenche `timeline.lane`. A versao
 * anterior caia direto no pool declarado do jogador, e errava feio: gravou o
 * Igor (jungler puro, de Warwick) como TOP e o Vini de jungle quando ele jogou
 * top a noite toda.
 *
 * O pool declarado diz o que a pessoa COSTUMA jogar -- não o que ela jogou
 * naquele jogo. Os dados da partida sabem melhor:
 *
 *   Smite            -> jungler. Em 5x5 sério é praticamente definitivo.
 *   monstros neutros -> quem farma selva é o jungler.
 *   CS de lane baixo -> support (a única role que não farma).
 *   visão alta       -> support.
 *   CS de lane alto  -> carry de lane, nunca support.
 *
 * Devolve pontuação por role em vez de um palpite único: assim a atribuição
 * final resolve o time inteiro de uma vez, respeitando "uma role por pessoa".
 */
function pontuarPorSinais(participante: SinaisDoParticipante): Record<Role, number> {
  const pontos = { TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 } as Record<Role, number>;

  const stats = participante.stats ?? {};
  const laneCs = stats.totalMinionsKilled ?? 0;
  const selvaCs = stats.neutralMinionsKilled ?? 0;
  const visao = stats.visionScore ?? 0;

  // --- jungle ---
  const temSmite =
    participante.spell1Id === SMITE_SPELL_ID || participante.spell2Id === SMITE_SPELL_ID;
  if (temSmite) pontos.JUNGLE += 100;
  if (selvaCs >= 60) pontos.JUNGLE += 40;
  else if (selvaCs >= 30) pontos.JUNGLE += 20;

  // --- support ---
  // Quem quase não farma em 5x5 é o support. É o sinal mais confiável depois
  // do Smite, e não depende de campeão.
  if (laneCs < 60) pontos.SUPPORT += 45;
  else if (laneCs < 100) pontos.SUPPORT += 15;
  if (visao >= 40) pontos.SUPPORT += 20;

  // --- carries de lane ---
  if (laneCs >= 150) {
    pontos.ADC += 25;
    pontos.MID += 20;
    pontos.TOP += 20;
    pontos.SUPPORT -= 40; // support com 150 de CS não existe
  }

  // Smite exclui as outras: quem tem Smite não estava de support nem de ADC.
  if (temSmite) {
    pontos.TOP -= 30;
    pontos.MID -= 30;
    pontos.ADC -= 40;
    pontos.SUPPORT -= 40;
  }

  // O que o cliente inferiu vale como voto forte, quando existe.
  const doCliente = roleFromTimeline(participante.timeline);
  if (doCliente) pontos[doCliente] += 60;

  return pontos;
}

interface SinaisDoParticipante {
  participantId: number;
  spell1Id?: number;
  spell2Id?: number;
  stats?: LcuParticipantStats;
  timeline?: { lane?: string; role?: string };
}

export function resolveTeamRoles(
  participants: SinaisDoParticipante[],
  poolByParticipantId: Map<number, DraftablePlayer>
): { roleByParticipantId: Map<number, Role>; inferred: boolean } {
  // --- caminho novo: pontuação por sinais da própria partida ---
  //
  // Só vale quando há sinal de verdade. Um fixture sem stats (ou um replay
  // antigo) cai no caminho antigo, baseado em lane + pool.
  const temSinais = participants.some(
    (p) =>
      p.spell1Id !== undefined ||
      (p.stats?.totalMinionsKilled ?? 0) > 0 ||
      (p.stats?.neutralMinionsKilled ?? 0) > 0
  );

  // --- 1a escolha: a ORDEM DO SAGUAO ---
  const porOrdem = atribuirPorOrdemDoSaguao(participants);
  if (porOrdem) return porOrdem;

  if (temSinais) {
    return atribuirPorPontuacao(participants, poolByParticipantId);
  }

  return atribuirPorLaneEPool(participants, poolByParticipantId);
}

/**
 * A ORDEM DOS PARTICIPANTES -- o melhor sinal, e o mais simples.
 *
 * A Riot devolve os participantes de cada time JA ORDENADOS POR POSICAO:
 * TOP, JUNGLE, MID, ADC, SUPPORT. Nao depende de como o saguao foi montado --
 * o grupo confirmou que nao organiza as vagas -- nem do `timeline.lane`, que em
 * custom vem errado (chega a marcar dois JUNGLE no mesmo time).
 *
 * Ou seja: a posicao ja vem PRONTA e deterministica da fonte. As versoes
 * anteriores deduziam pelo pool declarado e depois por Smite/CS, adivinhando um
 * dado que nunca precisou ser adivinhado.
 *
 * A ordem nao vem documentada como contrato, entao nao confiamos as cegas:
 * validamos com um sinal independente. Se a ordem estiver correta, quem levou
 * Smite tem que ser o SEGUNDO do time. Medido nas 4 partidas reais do grupo:
 * 8 times, 8 acertos. Quando nao bate, devolvemos null e caimos na pontuacao
 * por sinais.
 */
function atribuirPorOrdemDoSaguao(
  participants: SinaisDoParticipante[]
): { roleByParticipantId: Map<number, Role>; inferred: boolean } | null {
  if (participants.length !== ROLES.length) return null;

  const posicaoDoJungle = ROLES.indexOf('JUNGLE');
  const indiceComSmite = participants.findIndex(
    (p) => p.spell1Id === SMITE_SPELL_ID || p.spell2Id === SMITE_SPELL_ID
  );

  // Sem Smite no time nao ha como validar: melhor nao arriscar a premissa.
  if (indiceComSmite === -1) return null;
  if (indiceComSmite !== posicaoDoJungle) return null;

  const roleByParticipantId = new Map<number, Role>();
  participants.forEach((p, i) => roleByParticipantId.set(p.participantId, ROLES[i]));

  // Veio pronto da origem, não foi deduzido: a UI não precisa pedir conferência.
  return { roleByParticipantId, inferred: true };
}

/**
 * Atribui as 5 roles maximizando a pontuação total do time.
 *
 * São 5 jogadores e 5 roles: 120 permutações. Testar todas é instantâneo e
 * garante o ÓTIMO, em vez de um guloso que fixa a primeira escolha e depois se
 * arrepende. Guloso erraria justamente o caso comum: dois candidatos fortes
 * para jungle, e o que sobra empurrando alguém para uma role errada.
 */
function atribuirPorPontuacao(
  participants: SinaisDoParticipante[],
  poolByParticipantId: Map<number, DraftablePlayer>
): { roleByParticipantId: Map<number, Role>; inferred: boolean } {
  const pontuacoes = participants.map((p) => pontuarPorSinais(p));

  // O pool declarado entra como desempate leve: decide entre opções que os
  // sinais consideram equivalentes, sem sobrepor o que a partida mostrou.
  participants.forEach((p, i) => {
    const pool = poolByParticipantId.get(p.participantId);
    if (!pool) return;
    const roles = pool.roles.includes('FILL') ? ROLES : (pool.roles as Role[]);
    roles.forEach((role, posicao) => {
      if (ROLES.includes(role)) pontuacoes[i][role] += Math.max(8 - posicao * 3, 2);
    });
  });

  let melhorTotal = -Infinity;
  let melhorArranjo: Role[] = [...ROLES];

  const permutar = (restantes: Role[], atual: Role[]) => {
    if (restantes.length === 0) {
      const total = atual.reduce((soma, role, i) => soma + pontuacoes[i][role], 0);
      if (total > melhorTotal) {
        melhorTotal = total;
        melhorArranjo = [...atual];
      }
      return;
    }
    for (let i = 0; i < restantes.length; i++) {
      permutar([...restantes.slice(0, i), ...restantes.slice(i + 1)], [...atual, restantes[i]]);
    }
  };
  permutar([...ROLES], []);

  const roleByParticipantId = new Map<number, Role>();
  participants.forEach((p, i) => roleByParticipantId.set(p.participantId, melhorArranjo[i]));

  // "inferred" significa que a ORIGEM trouxe a posição pronta. Aqui deduzimos,
  // então a UI continua sendo avisada para pedir conferência.
  const todosDoCliente = participants.every((p) => roleFromTimeline(p.timeline) !== null);

  return { roleByParticipantId, inferred: todosDoCliente };
}

/** Caminho antigo: o que o cliente informou, e o pool para o que sobrou. */
function atribuirPorLaneEPool(
  participants: SinaisDoParticipante[],
  poolByParticipantId: Map<number, DraftablePlayer>
): { roleByParticipantId: Map<number, Role>; inferred: boolean } {
  const roleByParticipantId = new Map<number, Role>();
  const takenRoles = new Set<Role>();
  const unresolved: number[] = [];

  // 1a passada: aceita o que o cliente inferiu, desde que nao conflite.
  for (const participant of participants) {
    const role = roleFromTimeline(participant.timeline);
    if (role && !takenRoles.has(role)) {
      roleByParticipantId.set(participant.participantId, role);
      takenRoles.add(role);
    } else {
      unresolved.push(participant.participantId);
    }
  }

  if (unresolved.length === 0) {
    return { roleByParticipantId, inferred: true };
  }

  // 2a passada: as roles que sobraram sao distribuidas entre quem ficou de fora,
  // respeitando o pool declarado de cada um.
  const freeRoles = ROLES.filter((role) => !takenRoles.has(role));

  const candidates: DraftablePlayer[] = unresolved.map((participantId) => {
    const player = poolByParticipantId.get(participantId);
    return {
      // O id aqui e o participantId, nao o id do jogador: precisamos mapear de
      // volta para a linha do scoreboard depois.
      id: String(participantId),
      name: player?.name ?? `Participante ${participantId}`,
      // Sem cadastro conhecido, assume que aceita qualquer vaga que sobrou.
      roles: player?.roles ?? ['FILL'],
    };
  });

  // `assignRolesWithinTeam` exige 5 jogadores/5 vagas. Aqui o subconjunto e
  // menor, entao resolvemos com um emparelhamento guloso por escassez: quem tem
  // menos opcoes entre as roles livres escolhe primeiro (mesma ideia do MRV).
  const remaining = new Set<Role>(freeRoles);
  const ordered = [...candidates].sort((a, b) => {
    const optionsA = a.roles.includes('FILL')
      ? remaining.size
      : a.roles.filter((r) => remaining.has(r as Role)).length;
    const optionsB = b.roles.includes('FILL')
      ? remaining.size
      : b.roles.filter((r) => remaining.has(r as Role)).length;
    return optionsA - optionsB;
  });

  for (const candidate of ordered) {
    const acceptable = candidate.roles.includes('FILL')
      ? [...remaining]
      : (candidate.roles as Role[]).filter((role) => remaining.has(role));
    // Se o pool declarado nao cobre nada do que sobrou, pega qualquer vaga livre
    // -- o jogo ja aconteceu, o dado precisa entrar; a UI confirma depois.
    const chosen = acceptable[0] ?? [...remaining][0];
    if (!chosen) continue;
    roleByParticipantId.set(Number(candidate.id), chosen);
    remaining.delete(chosen);
  }

  return { roleByParticipantId, inferred: false };
}

// ---------------------------------------------------------------------------
// Mapper principal
// ---------------------------------------------------------------------------

export interface LcuImportedParticipant {
  puuid: string | null;
  riotId: string | null;
  summonerName: string | null;
  teamSide: TeamSide;
  rolePlayed: Role;
  championId: number;
  /** Preenchido quando a origem ja sabia o nome (replay). Senao null. */
  championName: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damageTaken: number;
  goldEarned: number;
  visionScore: number;
  cs: number;
  win: boolean;
  /** Destaques da partida -- ver o modelo MatchPlayerStat. */
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  firstBloodKill: boolean;
  firstBloodAssist: boolean;
  killingSprees: number;
  largestCriticalStrike: number;
  /** Scoreboard completo -- ver o modelo MatchPlayerStat. */
  champLevel: number;
  goldSpent: number;
  totalDamageDealt: number;
  damageToObjectives: number;
  damageToTurrets: number;
  damageSelfMitigated: number;
  totalHeal: number;
  physicalDamageToChampions: number;
  magicDamageToChampions: number;
  trueDamageToChampions: number;
  timeCCingOthers: number;
  longestTimeSpentLiving: number;
  turretKills: number;
  inhibitorKills: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWardsBought: number;
  laneMinionsKilled: number;
  neutralMinionsKilled: number;
  /** Os 7 slots em ordem, CSV. Null quando a origem nao traz item. */
  items: string | null;
  spell1Id: number | null;
  spell2Id: number | null;
  keystoneId: number | null;
  primaryStyleId: number | null;
  subStyleId: number | null;
}

export interface LcuImportedMatch {
  /** Formato match-v5: "BR1_1234567890". Serve de chave de idempotencia. */
  riotMatchId: string;
  playedAt: Date;
  gameDurationSec: number;
  isCustomGame: boolean;
  mapId: number | null;
  gameMode: string | null;
  /** 3130 = custom na Fenda com draft de torneio. */
  queueId: number | null;
  winner: TeamSide;
  /** false quando alguma role veio do pool declarado em vez do cliente. */
  rolesFullyInferred: boolean;
  /** Patch da partida, para a UI pedir os assets da versao certa. */
  gameVersion: string | null;
  /** Rendicao: o jogo acabou antes da hora, e os por-minuto ficam inflados. */
  surrendered: boolean;
  participants: LcuImportedParticipant[];
  teams: LcuImportedTeam[];
  bans: LcuImportedBan[];
}

/** Objetivos de um dos lados. */
export interface LcuImportedTeam {
  teamSide: TeamSide;
  win: boolean;
  towerKills: number;
  inhibitorKills: number;
  dragonKills: number;
  baronKills: number;
  riftHeraldKills: number;
  voidgrubKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  firstInhibitor: boolean;
  firstBaron: boolean;
  firstDragon: boolean;
}

export interface LcuImportedBan {
  teamSide: TeamSide;
  championId: number;
  pickTurn: number;
}

/** Quantos slots de item o scoreboard tem: 6 de build + 1 de trinket. */
const ITEM_SLOTS = 7;

/**
 * Os 7 slots de item em CSV, na ordem em que aparecem no jogo.
 *
 * Devolve null quando a origem nao traz item nenhum (caso do .rofl), para a
 * tela poder mostrar "build indisponivel" em vez de 7 slots vazios -- que
 * pareceria alguem que jogou a partida inteira sem comprar nada.
 */
function itemsCsv(stats: LcuParticipantStats): string | null {
  const slots = [
    stats.item0,
    stats.item1,
    stats.item2,
    stats.item3,
    stats.item4,
    stats.item5,
    stats.item6,
  ];
  if (slots.every((slot) => slot === undefined)) return null;
  return slots
    .slice(0, ITEM_SLOTS)
    .map((slot) => slot ?? 0)
    .join(',');
}

function teamWon(team: { win?: string | boolean } | undefined): boolean {
  if (!team) return false;
  // O LCU manda a string "Win"/"Fail"; algumas versoes mandam booleano.
  return typeof team.win === 'boolean' ? team.win : team.win === 'Win';
}

/**
 * Traduz um jogo do LCU para o nosso formato.
 *
 * `poolByPuuid` e opcional: quando informado, permite resolver posicoes
 * ambiguas usando as roles que a pessoa declarou no cadastro.
 */
export function mapLcuGame(
  game: LcuGame,
  poolByPuuid: Map<string, DraftablePlayer> = new Map()
): LcuImportedMatch {
  const participants = game.participants ?? [];
  const identities = game.participantIdentities ?? [];

  // --- mapa e modo antes de tudo: dao a razao REAL da recusa ---
  // (um ARAM 3x3 falharia tambem na contagem de participantes, mas "foi ARAM"
  // explica melhor que "tem 6 jogadores".)
  if (game.mapId !== undefined && game.mapId !== SUMMONERS_RIFT_MAP_ID) {
    const nome = MAP_NAMES[game.mapId] ?? `mapa ${game.mapId}`;
    throw new LcuError(
      `Essa partida foi no ${nome}, nao no Summoner’s Rift. ` +
        `O InHouse registra so os 5x5 da Fenda.`,
      'UNSUPPORTED_MAP',
      { gameId: game.gameId, mapId: game.mapId, gameMode: game.gameMode }
    );
  }

  if (game.gameMode && !(ALLOWED_GAME_MODES as readonly string[]).includes(game.gameMode)) {
    throw new LcuError(
      `Modo de jogo nao suportado: ${game.gameMode}. O InHouse registra so o 5x5 classico.`,
      'UNSUPPORTED_GAME_MODE',
      { gameId: game.gameId, gameMode: game.gameMode, mapId: game.mapId }
    );
  }

  if (participants.length !== 10) {
    throw new LcuError(
      `A partida ${game.gameId} tem ${participants.length} participantes; esperava 10. ` +
        `Partidas de treino contra bots ou com times incompletos nao entram no InHouse.`,
      'INVALID_PARTICIPANT_COUNT',
      { gameId: game.gameId, count: participants.length }
    );
  }

  const identityByParticipantId = new Map(
    identities.map((identity) => [identity.participantId, identity.player])
  );

  const poolByParticipantId = new Map<number, DraftablePlayer>();
  for (const participant of participants) {
    const puuid = identityByParticipantId.get(participant.participantId)?.puuid;
    const player = puuid ? poolByPuuid.get(puuid) : undefined;
    if (player) poolByParticipantId.set(participant.participantId, player);
  }

  // Cada lado resolve as proprias 5 roles independentemente.
  let rolesFullyInferred = true;
  const roleByParticipantId = new Map<number, Role>();

  for (const teamId of [100, 200]) {
    const teamParticipants = participants.filter((p) => p.teamId === teamId);
    if (teamParticipants.length !== 5) {
      throw new LcuError(
        `O time ${teamId === 100 ? 'azul' : 'vermelho'} tem ${teamParticipants.length} jogadores; esperava 5.`,
        'INVALID_TEAM_SIZE',
        { gameId: game.gameId, teamId }
      );
    }

    const { roleByParticipantId: teamRoles, inferred } = resolveTeamRoles(
      teamParticipants,
      poolByParticipantId
    );
    if (!inferred) rolesFullyInferred = false;
    for (const [participantId, role] of teamRoles) {
      roleByParticipantId.set(participantId, role);
    }
  }

  const blueWon = teamWon(game.teams?.find((team) => team.teamId === 100));

  const mapped: LcuImportedParticipant[] = participants.map((participant) => {
    const identity = identityByParticipantId.get(participant.participantId);
    const stats = participant.stats ?? {};
    const role = roleByParticipantId.get(participant.participantId);

    if (!role) {
      throw new LcuError(
        `Nao consegui determinar a posicao do participante ${participant.participantId}.`,
        'ROLE_UNRESOLVED',
        { gameId: game.gameId, participantId: participant.participantId }
      );
    }

    return {
      puuid: identity?.puuid ?? null,
      riotId:
        identity?.gameName && identity?.tagLine
          ? `${identity.gameName}#${identity.tagLine}`
          : null,
      summonerName: identity?.summonerName ?? null,
      teamSide: participant.teamId === 100 ? 'BLUE' : 'RED',
      rolePlayed: role,
      championId: participant.championId,
      championName: participant.championName ?? null,
      kills: stats.kills ?? 0,
      deaths: stats.deaths ?? 0,
      assists: stats.assists ?? 0,
      damage: stats.totalDamageDealtToChampions ?? 0,
      damageTaken: stats.totalDamageTaken ?? 0,
      goldEarned: stats.goldEarned ?? 0,
      visionScore: stats.visionScore ?? 0,
      cs: (stats.totalMinionsKilled ?? 0) + (stats.neutralMinionsKilled ?? 0),
      doubleKills: stats.doubleKills ?? 0,
      tripleKills: stats.tripleKills ?? 0,
      quadraKills: stats.quadraKills ?? 0,
      pentaKills: stats.pentaKills ?? 0,
      largestKillingSpree: stats.largestKillingSpree ?? 0,
      largestMultiKill: stats.largestMultiKill ?? 0,
      firstBloodKill: stats.firstBloodKill === true,
      firstBloodAssist: stats.firstBloodAssist === true,
      killingSprees: stats.killingSprees ?? 0,
      largestCriticalStrike: stats.largestCriticalStrike ?? 0,
      champLevel: stats.champLevel ?? 0,
      goldSpent: stats.goldSpent ?? 0,
      totalDamageDealt: stats.totalDamageDealt ?? 0,
      damageToObjectives: stats.damageDealtToObjectives ?? 0,
      damageToTurrets: stats.damageDealtToTurrets ?? 0,
      damageSelfMitigated: stats.damageSelfMitigated ?? 0,
      totalHeal: stats.totalHeal ?? 0,
      physicalDamageToChampions: stats.physicalDamageDealtToChampions ?? 0,
      magicDamageToChampions: stats.magicDamageDealtToChampions ?? 0,
      trueDamageToChampions: stats.trueDamageDealtToChampions ?? 0,
      timeCCingOthers: stats.timeCCingOthers ?? 0,
      longestTimeSpentLiving: stats.longestTimeSpentLiving ?? 0,
      turretKills: stats.turretKills ?? 0,
      inhibitorKills: stats.inhibitorKills ?? 0,
      wardsPlaced: stats.wardsPlaced ?? 0,
      wardsKilled: stats.wardsKilled ?? 0,
      controlWardsBought: stats.visionWardsBoughtInGame ?? 0,
      laneMinionsKilled: stats.totalMinionsKilled ?? 0,
      neutralMinionsKilled: stats.neutralMinionsKilled ?? 0,
      items: itemsCsv(stats),
      // Feiticos ficam no participante, nao em stats. O .rofl nao traz build
      // nenhuma, e ai vira null em vez de zero: zero significaria "slot vazio",
      // null significa "a origem nao sabe", e a tela precisa distinguir.
      spell1Id: participant.spell1Id ?? null,
      spell2Id: participant.spell2Id ?? null,
      keystoneId: stats.perk0 ?? null,
      primaryStyleId: stats.perkPrimaryStyle ?? null,
      subStyleId: stats.perkSubStyle ?? null,
      win: participant.teamId === 100 ? blueWon : !blueWon,
    };
  });

  return {
    riotMatchId: `${game.platformId ?? 'UNKNOWN'}_${game.gameId}`,
    playedAt: game.gameCreation
      ? new Date(game.gameCreation)
      : game.gameCreationDate
        ? new Date(game.gameCreationDate)
        : new Date(),
    gameDurationSec: game.gameDuration ?? 0,
    isCustomGame: game.gameType === 'CUSTOM_GAME' || game.queueId === 0,
    mapId: game.mapId ?? null,
    gameMode: game.gameMode ?? null,
    queueId: game.queueId ?? null,
    winner: blueWon ? 'BLUE' : 'RED',
    rolesFullyInferred,
    gameVersion: game.gameVersion ?? null,
    // A rendicao e do jogo, mas o LCU repete a flag em cada participante.
    // Basta um dizer que sim.
    surrendered: (game.participants ?? []).some(
      (participant) => participant.stats?.gameEndedInSurrender === true
    ),
    participants: mapped,
    teams: mapTeams(game),
    bans: mapBans(game),
  };
}

/** Azul e 100, vermelho e 200. Fora disso, o payload esta corrompido. */
function ladoDoTeamId(teamId: number): TeamSide | null {
  if (teamId === 100) return 'BLUE';
  if (teamId === 200) return 'RED';
  return null;
}

function mapTeams(game: LcuGame): LcuImportedTeam[] {
  const times: LcuImportedTeam[] = [];

  for (const team of game.teams ?? []) {
    const teamSide = ladoDoTeamId(team.teamId);
    if (!teamSide) continue;

    times.push({
      teamSide,
      win: teamWon(team),
      towerKills: team.towerKills ?? 0,
      inhibitorKills: team.inhibitorKills ?? 0,
      dragonKills: team.dragonKills ?? 0,
      baronKills: team.baronKills ?? 0,
      riftHeraldKills: team.riftHeraldKills ?? 0,
      voidgrubKills: team.hordeKills ?? 0,
      firstBlood: team.firstBlood === true,
      firstTower: team.firstTower === true,
      firstInhibitor: team.firstInhibitor === true,
      firstBaron: team.firstBaron === true,
      // O payload escreve "firstDargon". Aceitamos os dois: se a Riot corrigir
      // o typo num patch, a leitura continua funcionando sem release nossa.
      firstDragon: team.firstDragon === true || team.firstDargon === true,
    });
  }

  return times;
}

function mapBans(game: LcuGame): LcuImportedBan[] {
  const bans: LcuImportedBan[] = [];

  for (const team of game.teams ?? []) {
    const teamSide = ladoDoTeamId(team.teamId);
    if (!teamSide) continue;

    for (const ban of team.bans ?? []) {
      // championId -1 e o ban vazio (alguem deixou o tempo estourar). Guardar
      // isso poluiria a tela de Fearless com um campeao que nao existe.
      if (!ban.championId || ban.championId < 0 || !ban.pickTurn) continue;
      bans.push({ teamSide, championId: ban.championId, pickTurn: ban.pickTurn });
    }
  }

  return bans;
}

/** Reexportado para as rotas tratarem os dois erros de dominio juntos. */
export { DraftError };
