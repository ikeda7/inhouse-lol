/**
 * Regras da MD3: registro de jogo, Fearless Draft e fechamento da serie.
 */

import { prisma } from '../lib/prisma.js';
import { isRole, type Role, type TeamSide } from '../lib/roles.js';
import { resolveChampion } from '../lib/ddragon.js';

/** Vitorias necessarias para fechar uma melhor de 3. */
export const WINS_TO_CLINCH = 2;

// ---------------------------------------------------------------------------
// PLACAR DA MD3 -- por elenco, nao por cor
//
// Em custom os times trocam de lado entre os jogos. Contar vitorias por
// BLUE/RED faz um 2-0 virar 1-1 quando os mesmos 5 vencem os dois jogos de
// lados diferentes -- e ai a serie nunca fecha e ninguem leva o bonus de +1.
// Aconteceu de verdade na MD3 de 07/09/2026 deste grupo.
//
// A identidade de um time e o CONJUNTO DE JOGADORES. Ancoramos no jogo 1: quem
// estava de azul nele e o "Time A", quem estava de vermelho e o "Time B". Nos
// jogos seguintes, cada lado e classificado por sobreposicao de elenco.
//
// Os campos `blueScore`/`redScore` passam a guardar Time A / Time B. Mantive os
// nomes para nao migrar o banco com dados reais dentro; a UI rotula Time 1 / 2.
// ---------------------------------------------------------------------------

/** Maioria de 5: 3 jogadores em comum ja identificam o time. */
const MIN_OVERLAP_TO_MATCH_TEAM = 3;

interface MatchForStanding {
  matchNumber: number;
  winner: string | null;
  stats: { playerId: string; teamSide: string }[];
}

export interface SeriesStanding {
  teamAWins: number;
  teamBWins: number;
  /** true quando os elencos mudaram tanto que a ancora do jogo 1 nao serve. */
  rostersUnstable: boolean;
}

function rosterOf(match: MatchForStanding, side: 'BLUE' | 'RED'): Set<string> {
  return new Set(match.stats.filter((s) => s.teamSide === side).map((s) => s.playerId));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const id of a) if (b.has(id)) count++;
  return count;
}

export function computeSeriesStanding(matches: MatchForStanding[]): SeriesStanding {
  const ordered = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
  const first = ordered[0];
  if (!first) return { teamAWins: 0, teamBWins: 0, rostersUnstable: false };

  const teamA = rosterOf(first, 'BLUE');

  let teamAWins = 0;
  let teamBWins = 0;
  let rostersUnstable = false;

  for (const match of ordered) {
    if (match.winner !== 'BLUE' && match.winner !== 'RED') continue;

    const winners = rosterOf(match, match.winner);
    const semelhanca = overlap(winners, teamA);

    if (semelhanca >= MIN_OVERLAP_TO_MATCH_TEAM) {
      teamAWins++;
    } else if (winners.size - semelhanca >= MIN_OVERLAP_TO_MATCH_TEAM) {
      teamBWins++;
    } else {
      // Elenco embaralhado demais (re-sorteio no meio da MD3): sem ancora
      // confiavel, cai no lado bruto e sinaliza para a UI.
      rostersUnstable = true;
      if (match.winner === 'BLUE') teamAWins++;
      else teamBWins++;
    }
  }

  return { teamAWins, teamBWins, rostersUnstable };
}
export const MAX_MATCHES_PER_SERIES = 3;

export class SeriesError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'SeriesError';
  }
}

export interface MatchPlayerInput {
  playerId: string;
  teamSide: TeamSide;
  rolePlayed: Role;
  championName: string;
  championId?: number | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  damage?: number;
  damageTaken?: number;
  goldEarned?: number;
  visionScore?: number;
  cs?: number;
}

export interface RecordMatchInput {
  seriesId: string;
  /** Se omitido, entra como o proximo jogo da serie. */
  matchNumber?: number;
  winner: TeamSide;
  gameDurationSec?: number;
  riotMatchId?: string | null;
  source?: 'RIOT_API' | 'MANUAL';
  players: MatchPlayerInput[];
}

function validateMatchPlayers(players: MatchPlayerInput[]): void {
  if (players.length !== 10) {
    throw new SeriesError(
      `Uma partida precisa de 10 jogadores. Recebi ${players.length}.`,
      'INVALID_PLAYER_COUNT'
    );
  }

  const seen = new Set<string>();
  const bySideRole = new Set<string>();

  for (const player of players) {
    if (seen.has(player.playerId)) {
      throw new SeriesError(
        'O mesmo jogador aparece duas vezes na partida.',
        'DUPLICATE_PLAYER'
      );
    }
    seen.add(player.playerId);

    if (!isRole(player.rolePlayed)) {
      throw new SeriesError(`Role invalida: ${player.rolePlayed}.`, 'INVALID_ROLE');
    }

    const key = `${player.teamSide}:${player.rolePlayed}`;
    if (bySideRole.has(key)) {
      throw new SeriesError(
        `Role ${player.rolePlayed} duplicada no time ${player.teamSide}.`,
        'DUPLICATE_ROLE'
      );
    }
    bySideRole.add(key);
  }

  if (bySideRole.size !== 10) {
    throw new SeriesError(
      'Cada time precisa das 5 roles preenchidas exatamente uma vez.',
      'INCOMPLETE_ROLES'
    );
  }
}

/**
 * Campeoes ja queimados na serie. A tela de draft consome isso para pintar os
 * indisponiveis.
 */
export async function getBurnedChampions(seriesId: string) {
  const burned = await prisma.burnedChampion.findMany({
    where: { seriesId },
    orderBy: [{ matchNumberWhenBurned: 'asc' }, { championName: 'asc' }],
    include: { player: { select: { id: true, name: true } } },
  });

  // Enriquece com o icone do Data Dragon. Se o CDN estiver fora, devolve sem
  // imagem em vez de derrubar a tela inteira.
  return Promise.all(
    burned.map(async (entry) => {
      const asset = await resolveChampion(entry.championId ?? entry.championName).catch(
        () => null
      );
      return {
        championName: entry.championName,
        championId: entry.championId,
        ddragonId: asset?.id ?? null,
        matchNumberWhenBurned: entry.matchNumberWhenBurned,
        teamSide: entry.teamSide,
        player: entry.player,
      };
    })
  );
}

/**
 * Registra um jogo, queima os campeoes e atualiza o placar da serie -- tudo em
 * uma transacao. Se a queima falhar no meio, o jogo nao entra pela metade.
 */
export async function recordMatch(input: RecordMatchInput) {
  validateMatchPlayers(input.players);

  const series = await prisma.series.findUnique({
    where: { id: input.seriesId },
    include: { matches: { orderBy: { matchNumber: 'asc' } } },
  });

  if (!series) {
    throw new SeriesError('Serie nao encontrada.', 'SERIES_NOT_FOUND');
  }
  if (series.status === 'FINISHED') {
    throw new SeriesError('Essa MD3 ja foi encerrada.', 'SERIES_FINISHED');
  }

  const matchNumber = input.matchNumber ?? series.matches.length + 1;
  if (matchNumber < 1 || matchNumber > MAX_MATCHES_PER_SERIES) {
    throw new SeriesError(
      `Numero de jogo invalido: ${matchNumber}. Uma MD3 vai de 1 a ${MAX_MATCHES_PER_SERIES}.`,
      'INVALID_MATCH_NUMBER'
    );
  }
  if (series.matches.some((m) => m.matchNumber === matchNumber)) {
    throw new SeriesError(`O jogo ${matchNumber} dessa serie ja foi registrado.`, 'MATCH_EXISTS');
  }

  // Fearless: um campeao usado no jogo 1 nao pode voltar no 2 nem no 3.
  if (series.fearless) {
    const burned = await prisma.burnedChampion.findMany({
      where: { seriesId: series.id },
      select: { championName: true },
    });
    const burnedSet = new Set(burned.map((b) => b.championName.toLowerCase()));
    const violations = input.players
      .filter((p) => burnedSet.has(p.championName.toLowerCase()))
      .map((p) => p.championName);

    if (violations.length > 0) {
      throw new SeriesError(
        `Fearless Draft violado: ${[...new Set(violations)].join(', ')} ja foi(ram) usado(s) nessa MD3.`,
        'FEARLESS_VIOLATION'
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const match = await tx.match.create({
      data: {
        seriesId: series.id,
        matchNumber,
        winner: input.winner,
        gameDurationSec: input.gameDurationSec ?? null,
        riotMatchId: input.riotMatchId ?? null,
        source: input.source ?? 'MANUAL',
        stats: {
          create: input.players.map((player) => ({
            playerId: player.playerId,
            teamSide: player.teamSide,
            rolePlayed: player.rolePlayed,
            championName: player.championName,
            championId: player.championId ?? null,
            kills: player.kills ?? 0,
            deaths: player.deaths ?? 0,
            assists: player.assists ?? 0,
            damage: player.damage ?? 0,
            damageTaken: player.damageTaken ?? 0,
            goldEarned: player.goldEarned ?? 0,
            visionScore: player.visionScore ?? 0,
            cs: player.cs ?? 0,
            win: player.teamSide === input.winner,
          })),
        },
      },
      include: { stats: true },
    });

    if (series.fearless) {
      for (const player of input.players) {
        // upsert em vez de create: re-sincronizar a mesma partida nao explode
        // na unique [seriesId, championName].
        await tx.burnedChampion.upsert({
          where: {
            seriesId_championName: {
              seriesId: series.id,
              championName: player.championName,
            },
          },
          create: {
            seriesId: series.id,
            championName: player.championName,
            championId: player.championId ?? null,
            matchNumberWhenBurned: matchNumber,
            teamSide: player.teamSide,
            playerId: player.playerId,
          },
          update: {},
        });
      }
    }

    // Recalcula o placar do ZERO a partir de todos os jogos, em vez de somar
    // no acumulado. Custa uma consulta e garante que corrigir um jogo antigo
    // conserte a serie inteira, em vez de deixar um erro cravado no total.
    const todosOsJogos = await tx.match.findMany({
      where: { seriesId: series.id },
      select: {
        matchNumber: true,
        winner: true,
        stats: { select: { playerId: true, teamSide: true } },
      },
    });

    const { teamAWins, teamBWins } = computeSeriesStanding(todosOsJogos);
    const clinched = teamAWins >= WINS_TO_CLINCH || teamBWins >= WINS_TO_CLINCH;

    const updatedSeries = await tx.series.update({
      where: { id: series.id },
      data: {
        // blueScore/redScore = Time A / Time B (ancorados no jogo 1).
        blueScore: teamAWins,
        redScore: teamBWins,
        status: clinched ? 'FINISHED' : 'ONGOING',
        winnerTeam: clinched ? (teamAWins > teamBWins ? 'BLUE' : 'RED') : null,
      },
    });

    return { match, series: updatedSeries };
  });
}

/** Quem perdeu o ultimo mapa -- alimenta o modo de capitaes LAST_LOSERS. */
export async function getLastGameLosers(seriesId: string): Promise<string[]> {
  const lastMatch = await prisma.match.findFirst({
    where: { seriesId },
    orderBy: { matchNumber: 'desc' },
    include: { stats: { select: { playerId: true, win: true } } },
  });

  if (!lastMatch) return [];
  return lastMatch.stats.filter((stat) => !stat.win).map((stat) => stat.playerId);
}

export async function createSeries(input: { name?: string; fearless?: boolean }) {
  return prisma.series.create({
    data: {
      name: input.name?.trim() || null,
      fearless: input.fearless ?? true,
    },
  });
}

/** Encerra a serie na mao (ex.: a galera foi dormir no 1-1). */
export async function finishSeries(seriesId: string) {
  const series = await prisma.series.findUnique({ where: { id: seriesId } });
  if (!series) throw new SeriesError('Serie nao encontrada.', 'SERIES_NOT_FOUND');

  const winnerTeam =
    series.blueScore === series.redScore
      ? 'NONE'
      : series.blueScore > series.redScore
        ? 'BLUE'
        : 'RED';

  return prisma.series.update({
    where: { id: seriesId },
    data: { status: 'FINISHED', winnerTeam },
  });
}

export async function getSeriesDetail(seriesId: string) {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    include: {
      matches: {
        orderBy: { matchNumber: 'asc' },
        include: {
          stats: {
            include: { player: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  if (!series) return null;

  return { ...series, burnedChampions: await getBurnedChampions(seriesId) };
}

export async function listSeries(limit = 20) {
  const series = await prisma.series.findMany({
    orderBy: { date: 'desc' },
    take: limit,
    include: {
      matches: {
        orderBy: { matchNumber: 'asc' },
        select: { id: true, matchNumber: true, winner: true, gameDurationSec: true },
      },
      _count: { select: { burnedChampions: true } },
    },
  });

  return series.map((entry) => ({
    id: entry.id,
    name: entry.name,
    date: entry.date,
    status: entry.status,
    winnerTeam: entry.winnerTeam,
    /** Placar agregado no formato que a UI mostra: "2-1". */
    scoreline: `${entry.blueScore}-${entry.redScore}`,
    blueScore: entry.blueScore,
    redScore: entry.redScore,
    fearless: entry.fearless,
    matches: entry.matches,
    burnedCount: entry._count.burnedChampions,
  }));
}
