import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido por `requireAuth` (issue #3) a partir do cookie de sessao. */
      playerId?: string;
    }
  }
}
