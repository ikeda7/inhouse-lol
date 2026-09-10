import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { chaveConfere, signSession, verifySession, versaoDaSenha } from '../lib/auth.js';
import { criarLimitador } from '../lib/limite.js';
import { dispensaChave } from '../lib/escritas.js';

/**
 * As peças puras da trava de escrita. O repositório e o site são públicos:
 * cada uma delas é o que separa "o grupo" de "qualquer um com o link".
 */

describe('chaveConfere', () => {
  it('aceita a chave certa', () => {
    expect(chaveConfere('chave-do-grupo', 'chave-do-grupo')).toBe(true);
  });

  it('recusa chave errada, prefixo, vazia e ausente', () => {
    expect(chaveConfere('outra', 'chave-do-grupo')).toBe(false);
    expect(chaveConfere('chave', 'chave-do-grupo')).toBe(false);
    expect(chaveConfere('', 'chave-do-grupo')).toBe(false);
    expect(chaveConfere(undefined, 'chave-do-grupo')).toBe(false);
    expect(chaveConfere(null, 'chave-do-grupo')).toBe(false);
  });
});

describe('sessão amarrada à senha', () => {
  it('a impressão muda quando o hash muda e não revela o hash', () => {
    const antes = versaoDaSenha('$2a$10$hash-antigo');
    const depois = versaoDaSenha('$2a$10$hash-novo');

    expect(antes).not.toBe(depois);
    expect(antes).toHaveLength(16);
    expect(antes).not.toContain('hash-antigo');
  });

  it('o token carrega a impressão de volta', () => {
    const v = versaoDaSenha('$2a$10$qualquer');
    expect(verifySession(signSession({ playerId: 'p1', v }))).toEqual({ playerId: 'p1', v });
  });

  it('token antigo, sem a impressão, não vale mais', () => {
    // Emitido antes desta mudança: não há como derrubá-lo, então não vale.
    const legado = jwt.sign({ playerId: 'p1' }, env.jwtSecret, { expiresIn: '30d' });
    expect(verifySession(legado)).toBeNull();
  });
});

describe('criarLimitador', () => {
  it('deixa passar até o máximo e barra o seguinte', () => {
    const limite = criarLimitador({ maximo: 3, janelaMs: 1000 });
    expect([1, 2, 3].map(() => limite.tentar('ip', 0))).toEqual([true, true, true]);
    expect(limite.tentar('ip', 10)).toBe(false);
  });

  it('libera de novo quando a janela passa', () => {
    const limite = criarLimitador({ maximo: 1, janelaMs: 1000 });
    expect(limite.tentar('ip', 0)).toBe(true);
    expect(limite.tentar('ip', 500)).toBe(false);
    expect(limite.tentar('ip', 1001)).toBe(true);
  });

  it('conta cada chave separada', () => {
    const limite = criarLimitador({ maximo: 1, janelaMs: 1000 });
    expect(limite.tentar('ip-a', 0)).toBe(true);
    expect(limite.tentar('ip-b', 0)).toBe(true);
  });
});

describe('dispensaChave', () => {
  it('leitura nunca precisa de chave', () => {
    expect(dispensaChave('GET', '/players')).toBe(true);
    expect(dispensaChave('GET', '/series/abc')).toBe(true);
  });

  it('entrar e sair da conta, calcular times e jogar na sala ficam abertos', () => {
    expect(dispensaChave('POST', '/auth/login')).toBe(true);
    expect(dispensaChave('POST', '/auth/logout')).toBe(true);
    expect(dispensaChave('POST', '/draft/auto-balance')).toBe(true);
    expect(dispensaChave('POST', '/draft/captains/pick')).toBe(true);
    expect(dispensaChave('POST', '/draft/rooms/ABC23/pick')).toBe(true);
    expect(dispensaChave('POST', '/draft/rooms/ABC23/claim')).toBe(true);
  });

  it('o resto da escrita exige chave ou conta', () => {
    expect(dispensaChave('POST', '/auth/register')).toBe(false);
    expect(dispensaChave('POST', '/players')).toBe(false);
    expect(dispensaChave('PATCH', '/players/p1')).toBe(false);
    expect(dispensaChave('DELETE', '/players/p1')).toBe(false);
    expect(dispensaChave('POST', '/series')).toBe(false);
    expect(dispensaChave('POST', '/series/s1/matches')).toBe(false);
    expect(dispensaChave('DELETE', '/series/s1')).toBe(false);
    expect(dispensaChave('POST', '/ingest/lcu')).toBe(false);
    expect(dispensaChave('POST', '/riot/link')).toBe(false);
    expect(dispensaChave('POST', '/draft/rooms')).toBe(false);
    expect(dispensaChave('PATCH', '/accounts/me')).toBe(false);
  });

  it('rota nova, que ninguém listou, nasce protegida', () => {
    expect(dispensaChave('POST', '/qualquer/coisa/nova')).toBe(false);
    // Uma barra a mais não pode virar brecha.
    expect(dispensaChave('POST', '/auth/login/')).toBe(false);
  });
});
