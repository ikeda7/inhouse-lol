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

import { createHash, timingSafeEqual } from 'node:crypto';
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
  /**
   * Impressão da senha atual (ver `versaoDaSenha`). Trocar a senha ou liberar
   * a conta muda a impressão e derruba toda sessão emitida antes -- sem isso,
   * um JWT de 30 dias continuaria valendo depois de a conta mudar de dono.
   */
  v: string;
}

/** Sessao dura 30 dias -- grupo de amigos, sem motivo para expirar rapido. */
export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' });
}

/**
 * null em qualquer problema (expirado, assinatura invalida, payload torto) --
 * quem chama so precisa saber se a sessao vale ou nao. Token sem `v` (emitido
 * antes da impressão da senha existir) também não vale: é exatamente o tipo de
 * sessão que não dá para derrubar.
 */
export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof decoded.playerId === 'string' &&
      typeof decoded.v === 'string'
    ) {
      return { playerId: decoded.playerId, v: decoded.v };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Impressão do hash da senha: muda sempre que o hash muda (senha trocada,
 * conta liberada, conta reivindicada de novo) e não revela nada dele.
 */
export function versaoDaSenha(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

/**
 * Compara a chave do grupo em tempo constante.
 *
 * Compara os digests, não as strings: eles têm sempre o mesmo tamanho, então
 * `timingSafeEqual` não lança e o tempo de resposta não conta quantos
 * caracteres do chute estavam certos.
 */
export function chaveConfere(recebida: string | null | undefined, esperada: string): boolean {
  if (!recebida) return false;
  const a = createHash('sha256').update(recebida).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}
