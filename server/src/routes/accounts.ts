import { Router } from 'express';
import { z } from 'zod';
import { changePassword, setUploadedPhoto, syncLolPhoto } from '../services/auth.js';
import { updatePlayer } from '../services/players.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from './helpers.js';

export const accountsRouter = Router();

// Toda rota daqui pra baixo exige sessao valida.
accountsRouter.use(requireAuth);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  riotId: z.string().regex(/^.+#.+$/, 'Formato esperado: Nick#TAG').nullable().optional(),
});

/** PATCH /api/accounts/me - edicao do proprio perfil (reusa o service de players). */
accountsRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const player = await updatePlayer(req.playerId as string, input);
    res.json({ success: true, data: player });
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
