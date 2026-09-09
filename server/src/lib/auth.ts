/**
 * CONTAS DE JOGADOR (issue #3)
 *
 * Wrappers puros de senha e token de sessao -- sem Prisma. Fica em `lib/`
 * pelo mesmo criterio que separa `roles.ts`/`ddragon.ts`: nao toca banco, e
 * e o que da pra testar sem subir o Prisma (o resto da suite so testa logica
 * pura -- autoBalance, os parsers, os guards de `services/series.ts`).
 *
 * `bcryptjs` em vez de `bcrypt`: e JS puro, sem passo de compilacao nativa --
 * evita dor de node-gyp no Windows, que e onde este projeto roda.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './env.js';

const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  playerId: string;
}

/** Sessao dura 30 dias -- grupo de amigos, sem motivo para expirar rapido. */
export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' });
}

/** null em qualquer problema (expirado, assinatura invalida, payload torto) -- quem chama so precisa saber se a sessao vale ou nao. */
export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.playerId === 'string') {
      return { playerId: decoded.playerId };
    }
    return null;
  } catch {
    return null;
  }
}
