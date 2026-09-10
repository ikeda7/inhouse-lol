import { Router } from 'express';
import { z } from 'zod';
import {
  changePassword,
  emitirSessao,
  getAccountById,
  setUploadedPhoto,
  syncLolPhoto,
} from '../services/auth.js';
import { updatePlayer } from '../services/players.js';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from './helpers.js';

export const accountsRouter = Router();

// Toda rota daqui pra baixo exige sessao valida.
accountsRouter.use(requireAuth);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  riotId: z
    .string()
    .regex(/^.+#.+$/, 'Formato esperado: Nick#TAG')
    .nullable()
    .optional(),
});

/** PATCH /api/accounts/me - edicao do proprio perfil (reusa o service de players). */
accountsRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    await updatePlayer(req.playerId as string, input);
    // Devolve a CONTA, não o jogador público: quem editou o próprio perfil
    // continua precisando ver o próprio e-mail na tela.
    res.json({ success: true, data: await getAccountById(req.playerId as string) });
  })
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
});

accountsRouter.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const input = passwordSchema.parse(req.body);
    await changePassword({ playerId: req.playerId as string, ...input });
    // A senha nova derruba todas as sessoes emitidas antes (ver versaoDaSenha)
    // -- inclusive esta. Quem trocou ganha um token novo para nao cair junto.
    res.cookie(SESSION_COOKIE, await emitirSessao(req.playerId as string), SESSION_COOKIE_OPTIONS);
    res.json({ success: true, data: null });
  })
);

const photoSchema = z.object({
  imageBase64: z.string().min(1),
});

accountsRouter.post(
  '/me/photo',
  asyncHandler(async (req, res) => {
    const { imageBase64 } = photoSchema.parse(req.body);
    const player = await setUploadedPhoto(req.playerId as string, imageBase64);
    res.json({ success: true, data: player });
  })
);

accountsRouter.post(
  '/me/photo/sync-lol',
  asyncHandler(async (req, res) => {
    const player = await syncLolPhoto(req.playerId as string);
    res.json({ success: true, data: player });
  })
);
