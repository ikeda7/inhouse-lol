/**
 * ESTATISTICAS
 *
 * Volume de dados aqui e pequeno (uma noite por semana, 3 jogos, 10 pessoas),
 * entao carregamos as linhas e agregamos em memoria. E mais legivel que SQL cru
 * e evita as limitacoes de groupBy do Prisma com SQLite. Se um dia isso crescer
 * de verdade, o lugar de otimizar e aqui -- com $queryRaw ou uma view.
 */

import { prisma } from '../lib/prisma.js';
import { ROLES, type Role } from '../lib/roles.js';
import { resolveChampion } from '../lib/ddragon.js';
import { WINS_TO_CLINCH } from './series.js';

/** Pontuacao: +3 por mapa vencido, +1 de bonus por vencer a MD3. */
export const POINTS_PER_MAP_WIN = 3;
export const POINTS_PER_SERIES_WIN = 1;

export function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * KDA. Com 0 mortes a divisao explodiria, entao usamos a convencao da
 * comunidade: trata como "perfect KDA" contando 1 morte.
 */
export function computeKda(kills: number, deaths: number, assists: number): number {
  return round(safeDivide(kills + assists, Math.max(deaths, 1)));
}

interface StatRow {
  playerId: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  visionScore: number;
  cs: number;
  win: boolean;
  rolePlayed: string;
  championName: string;
  championId: number | null;
  teamSide: string;
  match: { id: string; gameDurationSec: number | null; seriesId: string };
  player: { id: string; name: string; photoUrl: string | null };
}

async function loadStatRows(where: Record<string, unknown> = {}): Promise<StatRow[]> {
  return prisma.matchPlayerStat.findMany({
    where,
    include: {
      // matchId e teamSide entram para dar participacao em abates: ela precisa
      // dos abates do TIME naquela partida, nao so os do jogador.
      match: { select: { id: true, gameDurationSec: true, seriesId: true } },
      player: { select: { id: true, name: true, photoUrl: true } },
    },
  }) as unknown as Promise<StatRow[]>;
}

/** Vencedores de MD3 por serie, para o bonus de +1 ponto. */
async function loadSeriesWinBonus(): Promise<Map<string, number>> {
  const finished = await prisma.series.findMany({
    where: { status: 'FINISHED', winnerTeam: { in: ['BLUE', 'RED'] } },
    select: {
      id: true,
      winnerTeam: true,
      matches: { select: { stats: { select: { playerId: true, win: true } } } },
    },
  });

  const bonusByPlayer = new Map<string, number>();

  for (const series of finished) {
    // NAO da para usar `stat.teamSide === series.winnerTeam`: em custom os
    // times trocam de lado entre os jogos, entao a cor nao identifica o time.
    //
    // Quem venceu a MD3 e, por definicao, quem ganhou os mapas necessarios para
    // fecha-la. Contar vitorias por jogador resolve o problema sem precisar
    // reconstruir a identidade dos times aqui.
    const vitoriasPorJogador = new Map<string, number>();
    for (const match of series.matches) {
      for (const stat of match.stats) {
        if (stat.win) {
          vitoriasPorJogador.set(stat.playerId, (vitoriasPorJogador.get(stat.playerId) ?? 0) + 1);
        }
      }
    }

    const winners = new Set(
      [...vitoriasPorJogador.entries()]
        .filter(([, vitorias]) => vitorias >= WINS_TO_CLINCH)
        .map(([playerId]) => playerId)
    );
    for (const playerId of winners) {
      bonusByPlayer.set(playerId, (bonusByPlayer.get(playerId) ?? 0) + POINTS_PER_SERIES_WIN);
    }
  }

  return bonusByPlayer;
}

/**
 * Quem venceu a MD3 mais recente que ja terminou.
 *
 * Pedido do grupo: "podia colocar um emoji ou aviso de quem ganhou o mais
 * recente, dai vai atualizando". Mesma regra do bonus: venceu a serie quem
 * ganhou os mapas necessarios para fecha-la.
 */
async function loadUltimosCampeoes(): Promise<Set<string>> {
  const ultima = await prisma.series.findFirst({
    where: { status: 'FINISHED', winnerTeam: { in: ['BLUE', 'RED'] } },
    orderBy: { date: 'desc' },
    select: { matches: { select: { stats: { select: { playerId: true, win: true } } } } },
  });
  if (!ultima) return new Set();

  const vitorias = new Map<string, number>();
  for (const match of ultima.matches) {
    for (const stat of match.stats) {
      if (stat.win) vitorias.set(stat.playerId, (vitorias.get(stat.playerId) ?? 0) + 1);
    }
  }
  return new Set([...vitorias.entries()].filter(([, v]) => v >= WINS_TO_CLINCH).map(([id]) => id));
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  /** Foto de perfil de quem já reivindicou a conta; null para o resto. */
  photoUrl: string | null;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  points: number;
  avgKda: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  avgDamagePerMinute: number;
  avgVisionScore: number;
  avgCsPerMinute: number;
  /** Quantas MD3 a pessoa venceu. Vira 🏆 por troféu, como o grupo já faz. */
  seriesWon: number;
  /** Venceu a MD3 mais recente. */
  wonLastSeries: boolean;
  /**
   * Os campeoes mais jogados, do mais para o menos. A tabela mostra os tres
   * primeiros -- "quem e essa pessoa" se responde melhor com os campeoes dela
   * do que com mais uma coluna de numero.
   */
  topChampions: { championName: string; games: number }[];
  /** Role mais jogada. Null quando ha empate ou ninguem jogou. */
  mainRole: string | null;
  /** Selo de brincadeira: KDA alto sem contribuicao na proporcao (issue #16). */
  isKdaPlayer: boolean;
}

export type LeaderboardSort = 'wins' | 'winRate' | 'avgKda' | 'points';

/**
 * As `quantos` chaves mais frequentes, da maior para a menor.
 *
 * Empate resolve por ordem alfabetica em vez de ordem de insercao: assim a
 * tabela nao muda de aparencia entre dois carregamentos so porque o banco
 * devolveu as linhas em outra ordem.
 */
function maisFrequentes(contagem: Map<string, number>, quantos: number): [string, number][] {
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, quantos);
}

// ---------------------------------------------------------------------------
// O SELO DE "KDA PLAYER" (issue #16)
//
// Pedido do grupo, como brincadeira. Mas a piada só funciona se o selo cair na
// pessoa certa -- e "quem tem o KDA mais alto" é a pessoa ERRADA. KDA alto com
// dano alto e presença nas brigas é só jogar bem.
//
// KDA player é quem tem número bonito SEM contribuir na proporção: pega o abate
// fácil, evita a briga, termina 8/1/4 num jogo que o time perdeu. O selo por
// isso combina dois sinais em direções opostas -- KDA acima da média junto de
// participação abaixo dela.
//
// POR QUE PARTICIPAÇÃO E NÃO DANO. Dano por minuto foi a primeira ideia e está
// errado: ele não é comparável entre roles. Jungler e suporte têm dano baixo
// por definição, então o selo caía neles sempre. No teste com dado real caiu num
// jungler 4-0 que fez 7/1/27 -- esteve em TODA briga da partida. Isso é
// carregar, não farmar KDA.
//
// Participação em abates é bem mais neutra: no grupo real ela vai de 37% a 63%
// com as cinco roles embaralhadas na ordem -- o primeiro e o último colocado
// são os dois TOP. É o sinal certo para "estava na briga ou não", que é
// exatamente o que define o arquétipo.
// ---------------------------------------------------------------------------

/**
 * Mínimo de jogos para concorrer.
 *
 * Baixo de propósito enquanto a base é pequena: com 4 partidas registradas,
 * exigir 5 jogos faria o selo nunca aparecer. Vale subir conforme o histórico
 * cresce -- com poucos jogos o título pula de pessoa a cada noite e perde graça.
 */
const MIN_JOGOS_PARA_SELO = 3;

/**
 * Quão acima da média a desproporção precisa estar.
 *
 * Sem essa margem o selo sempre teria dono, mesmo numa noite em que ninguém
 * jogou de KDA player -- e um selo que nunca falta não diz nada.
 */
const MARGEM_DO_SELO = 1.15;

export interface CandidatoAoSelo {
  playerId: string;
  games: number;
  kda: number;
  /** (abates + assistências) / abates do time, média das partidas. */
  killParticipation: number;
}

/** O mínimo que a participação precisa de cada linha do scoreboard. */
export interface LinhaParaParticipacao {
  playerId: string;
  kills: number;
  assists: number;
  teamSide: string;
  match: { id: string };
}

/**
 * Participação em abates por jogador.
 *
 * É o sinal mais direto de "estava na briga ou não", e o que separa o KDA
 * player do carregador. Precisa dos abates do TIME em cada partida, que saem da
 * soma dos 5 do mesmo lado -- sem coluna nova no banco.
 */
export function calcularKillParticipation(rows: LinhaParaParticipacao[]): Map<string, number> {
  const abatesDoTime = new Map<string, number>();
  for (const row of rows) {
    const chave = `${row.match.id}:${row.teamSide}`;
    abatesDoTime.set(chave, (abatesDoTime.get(chave) ?? 0) + row.kills);
  }

  const soma = new Map<string, { total: number; jogos: number }>();
  for (const row of rows) {
    const doTime = abatesDoTime.get(`${row.match.id}:${row.teamSide}`) ?? 0;
    // Time que não matou ninguém: participação é indefinida, não zero. Contar
    // como zero puniria quem jogou um estomp ao contrário.
    if (doTime === 0) continue;

    const atual = soma.get(row.playerId) ?? { total: 0, jogos: 0 };
    atual.total += (row.kills + row.assists) / doTime;
    atual.jogos += 1;
    soma.set(row.playerId, atual);
  }

  const media = new Map<string, number>();
  for (const [playerId, { total, jogos }] of soma) {
    media.set(playerId, safeDivide(total, jogos));
  }
  return media;
}

/**
 * Quem leva o selo. Null quando ninguém destoa o bastante.
 *
 * A conta é uma razão entre relativos: quanto o KDA da pessoa está acima da
 * média do grupo, dividido por quanto a contribuição dela está. Acima de 1
 * significa "colhe mais do que planta"; abaixo da margem, ninguém leva.
 */
export function escolherKdaPlayer(candidatos: CandidatoAoSelo[]): string | null {
  const elegiveis = candidatos.filter((c) => c.games >= MIN_JOGOS_PARA_SELO);
  if (elegiveis.length < 2) return null;

  const media = (pegar: (c: CandidatoAoSelo) => number) =>
    safeDivide(
      elegiveis.reduce((soma, c) => soma + pegar(c), 0),
      elegiveis.length
    );

  const mediaKda = media((c) => c.kda);
  const mediaKp = media((c) => c.killParticipation);
  if (mediaKda === 0 || mediaKp === 0) return null;

  let dono: string | null = null;
  let maiorRazao = 0;

  for (const candidato of elegiveis) {
    const kdaRelativo = candidato.kda / mediaKda;
    const participacaoRelativa = candidato.killParticipation / mediaKp;
    if (participacaoRelativa === 0) continue;

    // PORTAS DURAS, antes da razão.
    //
    // Para levar o selo é preciso os DOIS ao mesmo tempo: KDA acima da média do
    // grupo e participação abaixo dela. Sem as portas, o selo cai em quem tem
    // KDA muito alto e participação alta também, só porque o KDA varia muito
    // mais que o resto -- neste grupo ele vai de 1.0 a 10.5, então a razão
    // passaria a ser decidida quase só por ele.
    if (kdaRelativo <= 1 || participacaoRelativa >= 1) continue;

    const razao = kdaRelativo / participacaoRelativa;
    if (razao > maiorRazao) {
      maiorRazao = razao;
      dono = candidato.playerId;
    }
  }

  return maiorRazao >= MARGEM_DO_SELO ? dono : null;
}

export async function getLeaderboard(
  options: { sortBy?: LeaderboardSort; minGames?: number } = {}
): Promise<LeaderboardEntry[]> {
  const { sortBy = 'wins', minGames = 0 } = options;

  const [rows, seriesBonus, ultimosCampeoes] = await Promise.all([
    loadStatRows(),
    loadSeriesWinBonus(),
    loadUltimosCampeoes(),
  ]);

  interface Acc {
    name: string;
    /** Foto de perfil, para o ranking mostrar quem é quem sem ser só texto. */
    photoUrl: string | null;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    vision: number;
    cs: number;
    minutes: number;
    /** Contagem por campeao e por role, para derivar main e top 3. */
    champions: Map<string, number>;
    roles: Map<string, number>;
  }

  const byPlayer = new Map<string, Acc>();

  for (const row of rows) {
    const acc = byPlayer.get(row.playerId) ?? {
      name: row.player.name,
      photoUrl: row.player.photoUrl,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      vision: 0,
      cs: 0,
      minutes: 0,
      champions: new Map<string, number>(),
      roles: new Map<string, number>(),
    };

    acc.games += 1;
    acc.wins += row.win ? 1 : 0;
    acc.kills += row.kills;
    acc.deaths += row.deaths;
    acc.assists += row.assists;
    acc.damage += row.damage;
    acc.vision += row.visionScore;
    acc.cs += row.cs;
    // Sem duracao (registro manual apressado), assume 25min para nao zerar
    // a metrica por minuto do jogador inteiro.
    acc.minutes += (row.match.gameDurationSec ?? 1500) / 60;
    acc.champions.set(row.championName, (acc.champions.get(row.championName) ?? 0) + 1);
    acc.roles.set(row.rolePlayed, (acc.roles.get(row.rolePlayed) ?? 0) + 1);

    byPlayer.set(row.playerId, acc);
  }

  const killParticipation = calcularKillParticipation(rows);

  const entries: LeaderboardEntry[] = [...byPlayer.entries()]
    .map(([playerId, acc]) => ({
      playerId,
      name: acc.name,
      photoUrl: acc.photoUrl,
      games: acc.games,
      wins: acc.wins,
      losses: acc.games - acc.wins,
      winRate: round(safeDivide(acc.wins, acc.games) * 100, 1),
      points: acc.wins * POINTS_PER_MAP_WIN + (seriesBonus.get(playerId) ?? 0),
      avgKda: computeKda(acc.kills, acc.deaths, acc.assists),
      totalKills: acc.kills,
      totalDeaths: acc.deaths,
      totalAssists: acc.assists,
      avgDamagePerMinute: Math.round(safeDivide(acc.damage, acc.minutes)),
      avgVisionScore: round(safeDivide(acc.vision, acc.games), 1),
      avgCsPerMinute: round(safeDivide(acc.cs, acc.minutes), 1),
      seriesWon: (seriesBonus.get(playerId) ?? 0) / POINTS_PER_SERIES_WIN,
      wonLastSeries: ultimosCampeoes.has(playerId),
      topChampions: maisFrequentes(acc.champions, 3).map(([championName, games]) => ({
        championName,
        games,
      })),
      mainRole: maisFrequentes(acc.roles, 1)[0]?.[0] ?? null,
      // Preenchido logo abaixo, depois de ter todo mundo para comparar.
      isKdaPlayer: false,
    }))
    .filter((entry) => entry.games >= minGames);

  // O selo sai depois da lista montada, porque depende de comparar todo mundo
  // -- é sobre estar acima ou abaixo da média do grupo, não sobre um número
  // absoluto do jogador.
  const kdaPlayerId = escolherKdaPlayer(
    entries.map((entry) => ({
      playerId: entry.playerId,
      games: entry.games,
      kda: entry.avgKda,
      killParticipation: killParticipation.get(entry.playerId) ?? 0,
    }))
  );
  for (const entry of entries) {
    entry.isKdaPlayer = entry.playerId === kdaPlayerId;
  }

  // DESEMPATE EXPLÍCITO
  //
  // Com poucos jogos o critério principal empata direto -- dois jogadores 4-0
  // ficam iguais. A cadeia abaixo é a mesma que o grupo usa ao discutir a
  // tabela: primeiro o critério escolhido, depois KDA, depois winrate, e quem
  // jogou menos fica atrás. Sem isso a ordem de empate vem do banco, que é
  // arbitrária e muda entre carregamentos.
  //
  // Ordenar por KDA como critério PRINCIPAL premiaria quem evita luta; como
  // desempate, funciona.
  const desempate = (a: LeaderboardEntry, b: LeaderboardEntry) =>
    b.avgKda - a.avgKda || b.winRate - a.winRate || b.games - a.games;

  const comparators: Record<LeaderboardSort, (a: LeaderboardEntry, b: LeaderboardEntry) => number> =
    {
      wins: (a, b) => b.wins - a.wins || desempate(a, b),
      winRate: (a, b) => b.winRate - a.winRate || desempate(a, b),
      avgKda: (a, b) => b.avgKda - a.avgKda || b.winRate - a.winRate || b.games - a.games,
      points: (a, b) => b.points - a.points || desempate(a, b),
    };

  return entries.sort(comparators[sortBy]);
}

export interface ChampionPodiumEntry {
  championName: string;
  ddragonId: string | null;
  games: number;
  wins: number;
  winRate: number;
  avgKda: number;
}

/** Uma partida na lista do perfil. */
export interface RecentMatch {
  matchId: string;
  matchNumber: number;
  seriesId: string;
  seriesName: string | null;
  playedAt: string;
  gameDurationSec: number | null;
  championName: string;
  ddragonId: string | null;
  rolePlayed: Role;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  cs: number;
  visionScore: number;
  goldEarned: number;
  win: boolean;
  largestMultiKill: number;
  largestKillingSpree: number;
  firstBloodKill: boolean;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  /** Foto de quem ja reivindicou a conta; null para o resto. */
  photoUrl: string | null;
  games: number;
  wins: number;
  winRate: number;
  avgKda: number;
  avgDamagePerMinute: number;
  avgVisionScore: number;
  byRole: { role: Role; games: number; wins: number; winRate: number; avgKda: number }[];
  avgCsPerMinute: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  /** MD3 vencidas -- o mesmo trofeu que aparece na classificacao. */
  seriesWon: number;
  /** Top 3 campeoes mais jogados, com o id do Data Dragon para o icone. */
  championPodium: ChampionPodiumEntry[];
  /** As ultimas partidas, para o perfil responder "como ele vem jogando". */
  recentMatches: RecentMatch[];
}

/** Quantas partidas o perfil lista. Uma noite tem 2-3; dez cobre ~4 noites. */
const PARTIDAS_NO_PERFIL = 10;

/**
 * As ultimas partidas da pessoa, da mais recente para a mais antiga.
 *
 * Query propria em vez de alargar `loadStatRows`: aquela roda para TODOS os
 * jogadores no leaderboard, e carregar nome de serie e data de cada linha ali
 * seria peso em toda listagem para um dado que so o perfil usa.
 */
async function loadRecentMatches(playerId: string): Promise<RecentMatch[]> {
  const rows = await prisma.matchPlayerStat.findMany({
    where: { playerId },
    orderBy: { match: { playedAt: 'desc' } },
    take: PARTIDAS_NO_PERFIL,
    include: {
      match: {
        select: {
          id: true,
          matchNumber: true,
          gameDurationSec: true,
          playedAt: true,
          seriesId: true,
          series: { select: { name: true } },
        },
      },
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const asset = await resolveChampion(row.championId ?? row.championName).catch(() => null);
      return {
        matchId: row.match.id,
        matchNumber: row.match.matchNumber,
        seriesId: row.match.seriesId,
        seriesName: row.match.series.name,
        playedAt: row.match.playedAt.toISOString(),
        gameDurationSec: row.match.gameDurationSec,
        championName: row.championName,
        ddragonId: asset?.id ?? null,
        rolePlayed: row.rolePlayed as Role,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        damage: row.damage,
        cs: row.cs,
        visionScore: row.visionScore,
        goldEarned: row.goldEarned,
        win: row.win,
        // Os mesmos campos que o histórico usa para os selos, para o perfil
        // poder reaproveitar o componente em vez de ter uma regra própria.
        largestMultiKill: row.largestMultiKill,
        largestKillingSpree: row.largestKillingSpree,
        firstBloodKill: row.firstBloodKill,
      };
    })
  );
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true, photoUrl: true },
  });
  if (!player) return null;

  const [rows, recentMatches, seriesBonus] = await Promise.all([
    loadStatRows({ playerId }),
    loadRecentMatches(playerId),
    loadSeriesWinBonus(),
  ]);

  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let damage = 0;
  let vision = 0;
  let cs = 0;
  let minutes = 0;

  const roleAcc = new Map<Role, { games: number; wins: number; k: number; d: number; a: number }>();
  const champAcc = new Map<
    string,
    { games: number; wins: number; k: number; d: number; a: number; championId: number | null }
  >();

  for (const row of rows) {
    wins += row.win ? 1 : 0;
    kills += row.kills;
    deaths += row.deaths;
    assists += row.assists;
    damage += row.damage;
    vision += row.visionScore;
    cs += row.cs;
    minutes += (row.match.gameDurationSec ?? 1500) / 60;

    const role = row.rolePlayed as Role;
    const r = roleAcc.get(role) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
    r.games += 1;
    r.wins += row.win ? 1 : 0;
    r.k += row.kills;
    r.d += row.deaths;
    r.a += row.assists;
    roleAcc.set(role, r);

    const c = champAcc.get(row.championName) ?? {
      games: 0,
      wins: 0,
      k: 0,
      d: 0,
      a: 0,
      championId: row.championId,
    };
    c.games += 1;
    c.wins += row.win ? 1 : 0;
    c.k += row.kills;
    c.d += row.deaths;
    c.a += row.assists;
    champAcc.set(row.championName, c);
  }

  const games = rows.length;

  const topChampions = [...champAcc.entries()]
    .sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins)
    .slice(0, 3);

  const championPodium: ChampionPodiumEntry[] = await Promise.all(
    topChampions.map(async ([championName, acc]) => {
      const champion = await resolveChampion(acc.championId ?? championName).catch(() => null);
      return {
        championName,
        ddragonId: champion?.id ?? null,
        games: acc.games,
        wins: acc.wins,
        winRate: round(safeDivide(acc.wins, acc.games) * 100, 1),
        avgKda: computeKda(acc.k, acc.d, acc.a),
      };
    })
  );

  return {
    playerId: player.id,
    name: player.name,
    photoUrl: player.photoUrl,
    games,
    wins,
    winRate: round(safeDivide(wins, games) * 100, 1),
    avgKda: computeKda(kills, deaths, assists),
    avgDamagePerMinute: Math.round(safeDivide(damage, minutes)),
    avgVisionScore: round(safeDivide(vision, games), 1),
    avgCsPerMinute: round(safeDivide(cs, minutes), 1),
    totalKills: kills,
    totalDeaths: deaths,
    totalAssists: assists,
    seriesWon: (seriesBonus.get(playerId) ?? 0) / POINTS_PER_SERIES_WIN,
    recentMatches,
    // Mantem as 5 roles na ordem canonica, inclusive as com 0 jogos: a UI
    // desenha o grafico completo sem precisar preencher buracos.
    byRole: ROLES.map((role) => {
      const acc = roleAcc.get(role) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
      return {
        role,
        games: acc.games,
        wins: acc.wins,
        winRate: round(safeDivide(acc.wins, acc.games) * 100, 1),
        avgKda: computeKda(acc.k, acc.d, acc.a),
      };
    }),
    championPodium,
  };
}

/** Winrate por jogador, no formato que o modo Capitaes consome. */
export async function getWinRates(): Promise<Map<string, { winRate: number; games: number }>> {
  const leaderboard = await getLeaderboard();
  return new Map(
    leaderboard.map((entry) => [
      entry.playerId,
      { winRate: entry.winRate / 100, games: entry.games },
    ])
  );
}
