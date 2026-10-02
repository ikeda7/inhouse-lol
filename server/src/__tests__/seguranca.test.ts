import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { chaveConfere, signSession, verifySession, versaoDaSenha } from '../lib/auth.js';
import { criarLimitador } from '../lib/limite.js';
import { dispensaChave, nivelDaEscrita, podeAdministrar } from '../lib/escritas.js';

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
    expect(dispensaChave('POST', '/riot/import')).toBe(false);
    expect(dispensaChave('POST', '/draft/rooms')).toBe(false);
    expect(dispensaChave('PATCH', '/accounts/me')).toBe(false);
  });

  it('rota nova, que ninguém listou, nasce protegida', () => {
    expect(dispensaChave('POST', '/qualquer/coisa/nova')).toBe(false);
    // Uma barra a mais não pode virar brecha.
    expect(dispensaChave('POST', '/auth/login/')).toBe(false);
  });
});

describe('nivelDaEscrita', () => {
  it('o que já era aberto continua aberto', () => {
    expect(nivelDaEscrita('GET', '/players')).toBe('ABERTA');
    expect(nivelDaEscrita('POST', '/auth/login')).toBe('ABERTA');
    expect(nivelDaEscrita('POST', '/draft/captains/pick')).toBe('ABERTA');
    expect(nivelDaEscrita('POST', '/draft/rooms/ABC23/pick')).toBe('ABERTA');
  });

  it('a noite de jogo e a própria conta ficam com o grupo', () => {
    expect(nivelDaEscrita('POST', '/auth/register')).toBe('GRUPO');
    expect(nivelDaEscrita('PATCH', '/accounts/me')).toBe('GRUPO');
    expect(nivelDaEscrita('POST', '/accounts/me/password')).toBe('GRUPO');
    expect(nivelDaEscrita('POST', '/accounts/me/photo/sync-lol')).toBe('GRUPO');
    expect(nivelDaEscrita('POST', '/series/garantir')).toBe('GRUPO');
    expect(nivelDaEscrita('POST', '/ingest/lcu')).toBe('GRUPO');
    expect(nivelDaEscrita('POST', '/ingest/rofl')).toBe('GRUPO');
    expect(nivelDaEscrita('POST', '/draft/rooms')).toBe('GRUPO');
  });

  it('mexer no cadastro e no que já foi jogado é só do admin', () => {
    expect(nivelDaEscrita('POST', '/players')).toBe('ADMIN');
    expect(nivelDaEscrita('PATCH', '/players/p1')).toBe('ADMIN');
    expect(nivelDaEscrita('DELETE', '/players/p1')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/players/p1/contas')).toBe('ADMIN');
    expect(nivelDaEscrita('DELETE', '/players/p1/contas/c1')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/series')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/series/s1/matches')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/series/s1/finish')).toBe('ADMIN');
    expect(nivelDaEscrita('PATCH', '/series/s1')).toBe('ADMIN');
    expect(nivelDaEscrita('DELETE', '/series/s1')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/riot/import')).toBe('ADMIN');
  });

  it('rota nova, que ninguém listou, nasce só do admin', () => {
    expect(nivelDaEscrita('POST', '/qualquer/coisa/nova')).toBe('ADMIN');
    // Nem prefixo nem barra a mais rebaixam uma rota para o grupo.
    expect(nivelDaEscrita('POST', '/series/garantir/')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/accounts/me/../../players')).toBe('ADMIN');
    expect(nivelDaEscrita('PATCH', '/accounts/outro')).toBe('ADMIN');
    expect(nivelDaEscrita('POST', '/accounts/me/qualquer-coisa')).toBe('ADMIN');
  });

  it('a exceção vale para o método dela, não para o caminho inteiro', () => {
    // Esse cai em DELETE /series/:id, que apaga série.
    expect(nivelDaEscrita('DELETE', '/series/garantir')).toBe('ADMIN');
    expect(nivelDaEscrita('PATCH', '/series/garantir')).toBe('ADMIN');
    expect(nivelDaEscrita('DELETE', '/accounts/me')).toBe('ADMIN');
    expect(nivelDaEscrita('post', '/series/garantir')).toBe('GRUPO');
  });
});

describe('podeAdministrar', () => {
  it('sem admin configurado, vale a regra antiga: o grupo inteiro pode', () => {
    expect(podeAdministrar('p1', [])).toBe(true);
    expect(podeAdministrar(null, [])).toBe(true);
  });

  it('com admin configurado, só a conta dele passa', () => {
    expect(podeAdministrar('p1', ['p1', 'p2'])).toBe(true);
    expect(podeAdministrar('p3', ['p1', 'p2'])).toBe(false);
    // Chave do grupo sem conta nunca é admin.
    expect(podeAdministrar(null, ['p1'])).toBe(false);
  });
});
