import { Router } from 'express';
import { z } from 'zod';
import {
  emitirSessao,
  getAccountById,
  listClaimablePlayers,
  loginAccount,
  registerAccount,
} from '../services/auth.js';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  cadastroAberto,
  pedidoPodeAdministrar,
  requireAuth,
} from '../middleware/auth.js';
import { limitar } from '../middleware/limite.js';
import { asyncHandler } from './helpers.js';

export const authRouter = Router();

/**
 * GET /api/auth/claimable - jogadores sem conta ainda, para o Select de cadastro.
 *
 * Com o cadastro fechado (ver o register, logo abaixo) ninguém é reivindicável.
 */
authRouter.get(
  '/claimable',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: cadastroAberto() ? await listClaimablePlayers() : [] });
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
 *
 * Com admin nomeado o cadastro FECHA, para todo mundo: reivindicar só pedia a
 * chave do grupo, e quem a tivesse virava o jogador de um amigo sem conta --
 * ou o próprio admin, se a conta dele ainda não existisse. Por isso a conta do
 * admin tem de existir ANTES de o id entrar em ADMIN_PLAYER_IDS. As contas que
 * já existem continuam valendo.
 */
authRouter.post(
  '/register',
  limitar({ maximo: 5, janelaMs: 60 * 60_000 }),
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    if (!cadastroAberto()) {
      res.status(403).json({
        success: false,
        error: 'O cadastro de contas está fechado. Fale com o admin do grupo.',
        code: 'REGISTRATION_CLOSED',
      });
      return;
    }
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

/**
 * GET /api/auth/permissoes - o que este navegador pode fazer.
 *
 * Aberta e sem 401: a tela pergunta para ESCONDER os botões de admin de quem
 * não é, e visitante deslogado também precisa da resposta. Quem barra de
 * verdade é o `exigirAdmin`; isto é só para a tela não oferecer o que o
 * servidor vai recusar.
 */
authRouter.get(
  '/permissoes',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        podeAdministrar: await pedidoPodeAdministrar(req),
        cadastroAberto: cadastroAberto(),
      },
    });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const player = await getAccountById(req.playerId as string);
    res.json({ success: true, data: player });
  })
);
