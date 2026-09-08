/**
 * Regras da MD3: registro de jogo, Fearless Draft e fechamento da serie.
 */

import { prisma } from '../lib/prisma.js';
import { isRole, type Role, type TeamSide } from '../lib/roles.js';
import { resolveChampion } from '../lib/ddragon.js';

/** Vitorias necessarias para fechar uma melhor de 3. */
export const WINS_TO_CLINCH = 2;
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

  const blueScore = series.blueScore + (input.winner === 'BLUE' ? 1 : 0);
  const redScore = series.redScore + (input.winner === 'RED' ? 1 : 0);
  const clinched = blueScore >= WINS_TO_CLINCH || redScore >= WINS_TO_CLINCH;

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

    const updatedSeries = await tx.series.update({
      where: { id: series.id },
      data: {
        blueScore,
        redScore,
        status: clinched ? 'FINISHED' : 'ONGOING',
        winnerTeam: clinched ? (blueScore > redScore ? 'BLUE' : 'RED') : null,
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
