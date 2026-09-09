import { Router } from 'express';
import { z } from 'zod';
import { autoBalanceTeams, DraftError } from '../lib/autoBalance.js';
import {
  applyPick,
  buildPickOrder,
  finalizeCaptainsDraft,
  selectCaptains,
  startCaptainsDraft,
  type CaptainCandidate,
} from '../lib/captainsDraft.js';
import { findPlayersByIds, toDraftablePlayer } from '../services/players.js';
import { getLastGameLosers } from '../services/series.js';
import { getWinRates } from '../services/stats.js';
import { asyncHandler } from './helpers.js';

export const draftRouter = Router();

const rosterSchema = z
  .array(z.string().min(1))
  .length(10, 'Selecione exatamente 10 jogadores');

/**
 * Carrega os 10 jogadores e garante que todos os ids existem -- senao o draft
 * rodaria com 9 e daria um erro confuso la na frente.
 */
async function loadRoster(playerIds: string[]) {
  const players = await findPlayersByIds(playerIds);
  if (players.length !== playerIds.length) {
    const found = new Set(players.map((p) => p.id));
    const missing = playerIds.filter((id) => !found.has(id));
    throw new DraftError(
      `Jogador(es) nao encontrado(s): ${missing.join(', ')}.`,
      'PLAYER_NOT_FOUND',
      { missing }
    );
  }
  return players;
}

const autoBalanceSchema = z.object({
  playerIds: rosterSchema,
  /** Repassar a seed de um sorteio anterior reproduz exatamente o mesmo resultado. */
  seed: z.number().int().optional(),
  /** Ignora o rating e busca so o melhor encaixe de roles. */
  ignoreRating: z.boolean().optional(),
});

/**
 * POST /api/draft/auto-balance
 * O botao "Sortear Times".
 */
draftRouter.post(
  '/auto-balance',
  asyncHandler(async (req, res) => {
    const { playerIds, seed, ignoreRating } = autoBalanceSchema.parse(req.body);
    const roster = await loadRoster(playerIds);

    const result = autoBalanceTeams(roster.map(toDraftablePlayer), {
      seed,
      ...(ignoreRating ? { ratingWeight: 0 } : {}),
    });

    res.json({ success: true, data: result });
  })
);

const captainsSchema = z.object({
  playerIds: rosterSchema,
  mode: z.enum(['TOP_WINRATE', 'LAST_LOSERS', 'RANDOM']).default('TOP_WINRATE'),
  /** Necessario no modo LAST_LOSERS: de qual MD3 pegar quem perdeu o ultimo mapa. */
  seriesId: z.string().optional(),
  seed: z.number().int().optional(),
});

/**
 * POST /api/draft/captains/start
 * Escolhe os capitaes e devolve o estado inicial + a ordem snake 1-2-2-2-1.
 */
draftRouter.post(
  '/captains/start',
  asyncHandler(async (req, res) => {
    const { playerIds, mode, seriesId, seed } = captainsSchema.parse(req.body);
    const roster = await loadRoster(playerIds);
    const winRates = await getWinRates();

    const candidates: CaptainCandidate[] = roster.map((player) => {
      const stats = winRates.get(player.id);
      return {
        ...toDraftablePlayer(player),
        winRate: stats?.winRate ?? 0,
        gamesPlayed: stats?.games ?? 0,
      };
    });

    const lastGameLosers =
      mode === 'LAST_LOSERS' && seriesId ? await getLastGameLosers(seriesId) : [];

    const captains = selectCaptains({ roster: candidates, mode, lastGameLosers, seed });
    const state = startCaptainsDraft(candidates, captains);

    res.json({
      success: true,
      data: { ...state, pickOrder: buildPickOrder('BLUE') },
    });
  })
);

const pickSchema = z.object({
  /**
   * O estado do draft vive no cliente e volta inteiro a cada pick. Sem sessao
   * no servidor: um F5 na tela nao perde o draft, e nao ha estado orfao.
   */
  state: z.object({
    captains: z.record(z.string(), z.any()),
    available: z.array(z.any()),
    picks: z.record(z.string(), z.array(z.any())),
    onTheClock: z.enum(['BLUE', 'RED']).nullable(),
    pickNumber: z.number().int().min(1),
    finished: z.boolean(),
  }),
  playerId: z.string().min(1),
});

/** POST /api/draft/captains/pick */
draftRouter.post(
  '/captains/pick',
  asyncHandler(async (req, res) => {
    const { state, playerId } = pickSchema.parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = applyPick(state as any, playerId);

    res.json({
      success: true,
      data: {
        ...next,
        // Quando fecha o oitavo pick, ja devolve os times com as roles resolvidas.
        teams: next.finished ? finalizeCaptainsDraft(next) : null,
      },
    });
  })
);
