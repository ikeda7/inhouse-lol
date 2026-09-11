import { describe, expect, it } from 'vitest';
import { nomeDaNoite } from '../lib/nomeDaNoite';

// Datas no fuso de quem roda o teste: `new Date(ano, mês, dia, hora)` é local.
describe('nomeDaNoite', () => {
  it('dá o dia da semana e a data, no formato do Histórico', () => {
    expect(nomeDaNoite(new Date(2026, 8, 10, 21, 30))).toBe('Quinta 10/09');
  });

  it('feriado de segunda: 07/09/2026 é "Segunda", não "Domingo"', () => {
    expect(nomeDaNoite(new Date(2026, 8, 7, 20, 0))).toBe('Segunda 07/09');
  });

  it('depois da meia-noite ainda é a noite anterior', () => {
    expect(nomeDaNoite(new Date(2026, 8, 11, 0, 30))).toBe('Quinta 10/09');
    expect(nomeDaNoite(new Date(2026, 8, 11, 5, 59))).toBe('Quinta 10/09');
  });

  it('a partir das 6h já é o dia novo', () => {
    expect(nomeDaNoite(new Date(2026, 8, 11, 6, 0))).toBe('Sexta 11/09');
  });

  it('vira o mês direito', () => {
    expect(nomeDaNoite(new Date(2026, 9, 1, 1, 0))).toBe('Quarta 30/09');
  });
});
