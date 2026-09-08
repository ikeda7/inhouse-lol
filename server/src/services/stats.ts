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

/** Pontuacao: +3 por mapa vencido, +1 de bonus por vencer a MD3. */
export const POINTS_PER_MAP_WIN = 3;
export const POINTS_PER_SERIES_WIN = 1;

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * KDA. Com 0 mortes a divisao explodiria, entao usamos a convencao da
 * comunidade: trata como "perfect KDA" contando 1 morte.
 */
function computeKda(kills: number, deaths: number, assists: number): number {
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
  match: { gameDurationSec: number | null; seriesId: string };
  player: { id: string; name: string };
}

async function loadStatRows(where: Record<string, unknown> = {}): Promise<StatRow[]> {
  return prisma.matchPlayerStat.findMany({
    where,
    include: {
      match: { select: { gameDurationSec: true, seriesId: true } },
      player: { select: { id: true, name: true } },
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
      matches: { select: { stats: { select: { playerId: true, teamSide: true } } } },
    },
  });

  const bonusByPlayer = new Map<string, number>();

  for (const series of finished) {
    // Quem esteve no lado vencedor em qualquer mapa da serie leva o bonus uma
    // vez so -- os times podem ser re-sorteados entre os jogos.
    const winners = new Set<string>();
    for (const match of series.matches) {
      for (const stat of match.stats) {
        if (stat.teamSide === series.winnerTeam) winners.add(stat.playerId);
      }
    }
    for (const playerId of winners) {
      bonusByPlayer.set(
        playerId,
        (bonusByPlayer.get(playerId) ?? 0) + POINTS_PER_SERIES_WIN
      );
    }
  }

  return bonusByPlayer;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
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
}

export type LeaderboardSort = 'points' | 'winRate' | 'avgKda';

export async function getLeaderboard(
  options: { sortBy?: LeaderboardSort; minGames?: number } = {}
): Promise<LeaderboardEntry[]> {
  const { sortBy = 'points', minGames = 0 } = options;

  const [rows, seriesBonus] = await Promise.all([loadStatRows(), loadSeriesWinBonus()]);

  interface Acc {
    name: string;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    vision: number;
    cs: number;
    minutes: number;
  }

  const byPlayer = new Map<string, Acc>();

  for (const row of rows) {
    const acc = byPlayer.get(row.playerId) ?? {
      name: row.player.name,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      vision: 0,
      cs: 0,
      minutes: 0,
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

    byPlayer.set(row.playerId, acc);
  }

  const entries: LeaderboardEntry[] = [...byPlayer.entries()]
    .map(([playerId, acc]) => ({
      playerId,
      name: acc.name,
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
    }))
    .filter((entry) => entry.games >= minGames);

  const comparators: Record<LeaderboardSort, (a: LeaderboardEntry, b: LeaderboardEntry) => number> =
    {
      points: (a, b) => b.points - a.points || b.winRate - a.winRate,
      winRate: (a, b) => b.winRate - a.winRate || b.games - a.games,
      avgKda: (a, b) => b.avgKda - a.avgKda || b.games - a.games,
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

export interface PlayerProfile {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  winRate: number;
  avgKda: number;
  avgDamagePerMinute: number;
  avgVisionScore: number;
  byRole: { role: Role; games: number; wins: number; winRate: number; avgKda: number }[];
  /** Top 3 campeoes mais jogados, com o id do Data Dragon para o icone. */
  championPodium: ChampionPodiumEntry[];
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true },
  });
  if (!player) return null;

  const rows = await loadStatRows({ playerId });

  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let damage = 0;
  let vision = 0;
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
    games,
    wins,
    winRate: round(safeDivide(wins, games) * 100, 1),
    avgKda: computeKda(kills, deaths, assists),
    avgDamagePerMinute: Math.round(safeDivide(damage, minutes)),
    avgVisionScore: round(safeDivide(vision, games), 1),
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
