import { describe, expect, it } from 'vitest';
import { vaziaViraADaNoite } from '../services/series.js';

/**
 * A MD3 em andamento que o `garantir` reaproveita.
 *
 * Uma série aberta sem nome em 02/10 ficou "em andamento" e vazia por uma
 * semana. Sem esta regra, os jogos da noite seguinte entrariam nela, com o
 * nome velho. Vazia, ela não tem nada a preservar e vira a da noite; com
 * qualquer jogo, é a noite de alguém e não muda.
 */
describe('vaziaViraADaNoite', () => {
  it('a vazia sem nome assume o nome da noite', () => {
    expect(vaziaViraADaNoite(null, 0, 'Quinta 08/10')).toBe(true);
  });

  it('a vazia de outra noite assume o nome desta', () => {
    expect(vaziaViraADaNoite('Quinta 01/10', 0, 'Quinta 08/10')).toBe(true);
  });

  it('com jogo registrado, nunca muda', () => {
    expect(vaziaViraADaNoite('Quinta 01/10', 1, 'Quinta 08/10')).toBe(false);
  });

  it('já com o nome da noite, não há o que mudar', () => {
    expect(vaziaViraADaNoite('Quinta 08/10', 0, 'Quinta 08/10')).toBe(false);
  });

  it('sem nome pedido, fica como está', () => {
    expect(vaziaViraADaNoite(null, 0, undefined)).toBe(false);
  });
});
