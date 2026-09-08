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
}

export interface LcuParticipant {
  participantId: number;
  championId: number;
  /** So o .rofl preenche: ele guarda o NOME do campeao, nao o id numerico. */
  championName?: string;
  teamId: number; // 100 = azul, 200 = vermelho
  stats?: LcuParticipantStats;
  timeline?: { lane?: string; role?: string };
}

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
  teams?: { teamId: number; win?: string | boolean }[];
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
export function resolveTeamRoles(
  participants: { participantId: number; timeline?: { lane?: string; role?: string } }[],
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
  participants: LcuImportedParticipant[];
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
    participants: mapped,
  };
}

/** Reexportado para as rotas tratarem os dois erros de dominio juntos. */
export { DraftError };
