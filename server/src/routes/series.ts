import { Router } from 'express';
import { z } from 'zod';
import {
  createSeries,
  discardEmptySeries,
  finishSeries,
  garantirSerieDaNoite,
  getBurnedChampions,
  getSeriesDetail,
  listSeries,
  recordMatch,
  renameSeries,
} from '../services/series.js';
import { prisma } from '../lib/prisma.js';
import { ROLES, TEAM_SIDES } from '../lib/roles.js';
import { asyncHandler } from './helpers.js';

export const seriesRouter = Router();

const matchPlayerSchema = z.object({
  playerId: z.string().min(1),
  teamSide: z.enum(TEAM_SIDES),
  rolePlayed: z.enum(ROLES),
  championName: z.string().min(1),
  championId: z.number().int().optional().nullable(),
  kills: z.number().int().min(0).default(0),
  deaths: z.number().int().min(0).default(0),
  assists: z.number().int().min(0).default(0),
  damage: z.number().int().min(0).default(0),
  damageTaken: z.number().int().min(0).default(0),
  goldEarned: z.number().int().min(0).default(0),
  visionScore: z.number().int().min(0).default(0),
  cs: z.number().int().min(0).default(0),
});

/** Payload do formulario manual (fallback quando a Riot API falha). */
const recordMatchSchema = z.object({
  matchNumber: z.number().int().min(1).max(3).optional(),
  winner: z.enum(TEAM_SIDES),
  gameDurationSec: z.number().int().min(0).optional(),
  riotMatchId: z.string().optional().nullable(),
  source: z.enum(['RIOT_API', 'MANUAL']).optional(),
  players: z.array(matchPlayerSchema).length(10, 'A partida precisa dos 10 jogadores'),
});

/** GET /api/series - historico de MD3 com placar agregado. */
seriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    res.json({ success: true, data: await listSeries(limit) });
  })
);

/** GET /api/series/current - a MD3 em andamento, se houver. */
seriesRouter.get(
  '/current',
  asyncHandler(async (_req, res) => {
    const ongoing = await prisma.series.findFirst({
      where: { status: 'ONGOING' },
      orderBy: { date: 'desc' },
    });
    if (!ongoing) {
      res.json({ success: true, data: null });
      return;
    }
    res.json({ success: true, data: await getSeriesDetail(ongoing.id) });
  })
);

/** GET /api/series/:id - detalhe com jogos expandiveis e queimados. */
seriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const series = await getSeriesDetail(req.params.id);
    if (!series) {
      res.status(404).json({ success: false, error: 'Série não encontrada.' });
      return;
    }
    res.json({ success: true, data: series });
  })
);

/**
 * GET /api/series/:id/burned
 * Alimenta a secao de "Campeoes Queimados" durante a noite de jogos.
 */
seriesRouter.get(
  '/:id/burned',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getBurnedChampions(req.params.id) });
  })
);

const createSeriesSchema = z.object({
  name: z.string().trim().max(60).optional(),
  fearless: z.boolean().optional(),
});

/** POST /api/series - abre a noite de jogos. Recusa se já houver uma em andamento. */
seriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSeriesSchema.parse(req.body);
    res.status(201).json({ success: true, data: await createSeries(input) });
  })
);

/**
 * POST /api/series/garantir - a MD3 em andamento, ou uma nova.
 * É o "Usar esses times" do Sorteio e da sala de draft (#77).
 */
seriesRouter.post(
  '/garantir',
  asyncHandler(async (req, res) => {
    const input = createSeriesSchema.parse(req.body);
    const { serie, criada } = await garantirSerieDaNoite(input);
    res.status(criada ? 201 : 200).json({ success: true, data: { serie, criada } });
  })
);

/** POST /api/series/:id/matches - registra um jogo (manual ou vindo da Riot). */
seriesRouter.post(
  '/:id/matches',
  asyncHandler(async (req, res) => {
    const input = recordMatchSchema.parse(req.body);
    const result = await recordMatch({ seriesId: req.params.id, ...input });
    res.status(201).json({ success: true, data: result });
  })
);

/** POST /api/series/:id/finish - encerra na mao (ex.: pararam no 1-1). */
seriesRouter.post(
  '/:id/finish',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await finishSeries(req.params.id) });
  })
);

/**
 * DELETE /api/series/:id - descarta uma serie que nunca teve jogo.
 *
 * O servico recusa se houver partida gravada. Essa checagem mora la de
 * proposito: e a mesma garantia para qualquer chamador, inclusive um `curl`.
 */
seriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await discardEmptySeries(req.params.id) });
  })
);

const renameSeriesSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à série').max(60),
});

/** PATCH /api/series/:id - corrige o nome (ex.: "Domingo 07/09" que foi numa segunda). */
seriesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name } = renameSeriesSchema.parse(req.body);
    res.json({ success: true, data: await renameSeries(req.params.id, name) });
  })
);
