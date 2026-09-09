import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../lib/auth.js';

/** Nome do cookie de sessao das contas de jogador (issue #3). */
export const SESSION_COOKIE = 'inhouse_session';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Exige sessao valida. `cors({credentials:true})` + `cookie-parser` (ver
 * app.ts) sao o que fazem o cookie ir e voltar entre o Vite (:5173) e a API
 * (:3333) em dev -- em producao os dois ja saem do mesmo host.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const session = token ? verifySession(token) : null;

  if (!session) {
    res.status(401).json({ success: false, error: 'Nao autenticado.', code: 'NOT_AUTHENTICATED' });
    return;
  }

  req.playerId = session.playerId;
  next();
}
