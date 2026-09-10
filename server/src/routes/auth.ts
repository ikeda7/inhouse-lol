import { Router } from 'express';
import { z } from 'zod';
import {
  emitirSessao,
  getAccountById,
  listClaimablePlayers,
  loginAccount,
  registerAccount,
} from '../services/auth.js';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, requireAuth } from '../middleware/auth.js';
import { limitar } from '../middleware/limite.js';
import { asyncHandler } from './helpers.js';

export const authRouter = Router();

/** GET /api/auth/claimable - jogadores sem conta ainda, para o Select de cadastro. */
authRouter.get(
  '/claimable',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listClaimablePlayers() });
  })
);

const registerSchema = z.object({
  playerId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
});

/**
 * POST /api/auth/register - reivindica um jogador ja cadastrado como conta.
 *
 * Com a GROUP_KEY ligada, so passa quem manda a chave do grupo (exigirGrupo,
 * em app.ts). Sem isso, qualquer visitante do site publico reivindicava o
 * jogador de qualquer amigo antes dele.
 */
authRouter.post(
  '/register',
  limitar({ maximo: 5, janelaMs: 60 * 60_000 }),
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const player = await registerAccount(input);

    res.cookie(SESSION_COOKIE, await emitirSessao(player.id), SESSION_COOKIE_OPTIONS);
    res.status(201).json({ success: true, data: player });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Dez tentativas por IP a cada 15 minutos: sobra para quem errou a senha, falta para robô. */
authRouter.post(
  '/login',
  limitar({ maximo: 10, janelaMs: 15 * 60_000 }),
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const player = await loginAccount(input);

    res.cookie(SESSION_COOKIE, await emitirSessao(player.id), SESSION_COOKIE_OPTIONS);
    res.json({ success: true, data: player });
  })
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
  res.json({ success: true, data: null });
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const player = await getAccountById(req.playerId as string);
    res.json({ success: true, data: player });
  })
);
