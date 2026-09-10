import { describe, expect, it } from 'vitest';
import { toAccountDTO, toPlayerDTO } from '../services/players.js';

/**
 * O PlayerDTO sai em rota pública, sem login (GET /api/players). Ele já levou
 * o e-mail de todo mundo que tinha criado conta, num site e num repositório
 * públicos. Este teste é a trava: o DTO público nunca carrega e-mail nem hash,
 * e o e-mail só aparece no AccountDTO, que só o dono da conta recebe.
 */

function linha(overrides: Partial<Parameters<typeof toPlayerDTO>[0]> = {}) {
  return {
    id: 'p1',
    name: 'Ikeda',
    riotId: 'Ikeda#BR1',
    internalRating: 1000,
    active: true,
    email: 'alguem@exemplo.com',
    passwordHash: '$2a$10$hash-de-mentira',
    photoUrl: null,
    photoSource: 'NONE',
    roles: [
      { role: 'MID', priority: 1 },
      { role: 'TOP', priority: 0 },
    ],
    ...overrides,
  };
}

describe('toPlayerDTO', () => {
  it('não expõe e-mail nem hash de senha', () => {
    const dto = toPlayerDTO(linha());

    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(dto)).not.toContain('alguem@exemplo.com');
    expect(JSON.stringify(dto)).not.toContain('hash-de-mentira');
  });

  it('diz se a pessoa já tem conta, pelo hash e não pelo e-mail', () => {
    expect(toPlayerDTO(linha()).hasAccount).toBe(true);
    expect(toPlayerDTO(linha({ passwordHash: null, email: null })).hasAccount).toBe(false);
  });

  it('ordena as roles pela prioridade', () => {
    expect(toPlayerDTO(linha()).roles).toEqual(['TOP', 'MID']);
  });
});

describe('toAccountDTO', () => {
  it('traz o e-mail, porque só o dono da conta recebe esse formato', () => {
    const conta = toAccountDTO(linha());

    expect(conta.email).toBe('alguem@exemplo.com');
    expect(conta.hasAccount).toBe(true);
    expect(conta).not.toHaveProperty('passwordHash');
  });
});
