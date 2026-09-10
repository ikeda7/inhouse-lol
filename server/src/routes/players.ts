import { Router } from 'express';
import { z } from 'zod';
import {
  createPlayer,
  deactivatePlayer,
  getPlayerById,
  listPlayers,
  updatePlayer,
} from '../services/players.js';
import { getPlayerProfile } from '../services/stats.js';
import { asyncHandler } from './helpers.js';

export const playersRouter = Router();

const roleSchema = z
  .string()
  .min(2)
  .describe('TOP | JUNGLE | MID | ADC | SUPPORT | FILL (aceita variacoes)');

const createPlayerSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(40),
  // Ordem importa: o primeiro item e a role principal.
  roles: z.array(roleSchema).min(1, 'Informe ao menos uma role'),
  riotId: z
    .string()
    .regex(/^.+#.+$/, 'Riot ID deve ter o formato Nick#TAG')
    .optional()
    .nullable(),
  internalRating: z.number().int().min(0).max(5000).optional(),
});

const updatePlayerSchema = createPlayerSchema.partial().extend({
  active: z.boolean().optional(),
});

/** GET /api/players?includeInactive=true */
playersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    res.json({ success: true, data: await listPlayers({ includeInactive }) });
  })
);

/** GET /api/players/:id */
playersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const player = await getPlayerById(req.params.id);
    if (!player) {
      res.status(404).json({ success: false, error: 'Jogador não encontrado.' });
      return;
    }
    res.json({ success: true, data: player });
  })
);

/** GET /api/players/:id/profile - KDA, dano/min, winrate por role, podio de campeoes. */
playersRouter.get(
  '/:id/profile',
  asyncHandler(async (req, res) => {
    const profile = await getPlayerProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Jogador não encontrado.' });
      return;
    }
    res.json({ success: true, data: profile });
  })
);

/** POST /api/players */
playersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createPlayerSchema.parse(req.body);
    res.status(201).json({ success: true, data: await createPlayer(input) });
  })
);

/** PATCH /api/players/:id */
playersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updatePlayerSchema.parse(req.body);
    res.json({ success: true, data: await updatePlayer(req.params.id, input) });
  })
);

/** DELETE /api/players/:id - desativa, nao apaga (preserva o historico). */
playersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await deactivatePlayer(req.params.id) });
  })
);
