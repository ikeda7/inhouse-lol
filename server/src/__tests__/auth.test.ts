import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, signSession, verifyPassword, verifySession } from '../lib/auth.js';
import { env } from '../lib/env.js';

/**
 * Senha e sessao das contas de jogador (issue #3).
 *
 * Sao os dois pontos onde errar custa caro: hash que nao confere deixa
 * qualquer senha entrar, e token aceito sem checar assinatura deixa qualquer
 * um virar qualquer jogador. Como o resto da suite, testa so logica pura --
 * nada aqui sobe Prisma.
 */

describe('senha', () => {
  it('confere a senha correta contra o proprio hash', async () => {
    const hash = await hashPassword('senha-do-jogador');

    await expect(verifyPassword('senha-do-jogador', hash)).resolves.toBe(true);
  });

  it('recusa senha errada', async () => {
    const hash = await hashPassword('senha-do-jogador');

    await expect(verifyPassword('senha-errada', hash)).resolves.toBe(false);
  });

  it('gera hashes diferentes para a mesma senha -- o salt e por hash', async () => {
    const primeiro = await hashPassword('mesma-senha');
    const segundo = await hashPassword('mesma-senha');

    expect(primeiro).not.toBe(segundo);
    await expect(verifyPassword('mesma-senha', primeiro)).resolves.toBe(true);
    await expect(verifyPassword('mesma-senha', segundo)).resolves.toBe(true);
  });

  it('nao guarda a senha em claro no hash', async () => {
    const hash = await hashPassword('senha-do-jogador');

    expect(hash).not.toContain('senha-do-jogador');
  });
});

describe('sessao', () => {
  it('devolve o playerId e a impressão da senha que assinaram', () => {
    const token = signSession({ playerId: 'jogador-1', v: 'impressao-1' });

    expect(verifySession(token)).toEqual({ playerId: 'jogador-1', v: 'impressao-1' });
  });

  it('recusa token assinado com outro segredo', () => {
    const forjado = jwt.sign({ playerId: 'jogador-1' }, 'outro-segredo');

    expect(verifySession(forjado)).toBeNull();
  });

  it('recusa token adulterado', () => {
    const token = signSession({ playerId: 'jogador-1', v: 'impressao-1' });
    const adulterado = `${token.slice(0, -3)}xyz`;

    expect(verifySession(adulterado)).toBeNull();
  });

  it('recusa token expirado', () => {
    const expirado = jwt.sign({ playerId: 'jogador-1' }, env.jwtSecret, { expiresIn: '-1s' });

    expect(verifySession(expirado)).toBeNull();
  });

  it('recusa token sem playerId -- assinatura valida nao basta', () => {
    const semDono = jwt.sign({ outraCoisa: true }, env.jwtSecret);

    expect(verifySession(semDono)).toBeNull();
  });

  it('recusa lixo que nem e token', () => {
    expect(verifySession('nao-sou-um-jwt')).toBeNull();
  });
});
