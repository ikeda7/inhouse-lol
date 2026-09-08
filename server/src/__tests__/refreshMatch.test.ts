import { describe, expect, it } from 'vitest';
import { assertMesmaPartida, SeriesError } from '../services/series.js';

/**
 * Guardas do `refreshMatchStats`.
 *
 * Reescrever a scoreboard de uma partida ja gravada e a unica operacao do
 * projeto que sobrescreve dado real, e o unico jeito de saber que a origem e a
 * mesma partida e comparar vencedor e elenco. Se estas guardas cederem, os
 * numeros de um jogo entram silenciosamente em cima de outro -- entao elas sao
 * testadas isoladas da camada de banco.
 */

const TIME_A = ['p1', 'p2', 'p3', 'p4', 'p5'];
const TIME_B = ['p6', 'p7', 'p8', 'p9', 'p10'];
const ELENCO = [...TIME_A, ...TIME_B];

function codigoDoErro(fn: () => void): string {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof SeriesError) return erro.code;
    throw erro;
  }
  return 'NAO_LANCOU';
}

describe('assertMesmaPartida', () => {
  it('aceita quando vencedor e elenco sao identicos', () => {
    expect(() =>
      assertMesmaPartida({ winner: 'BLUE', playerIds: ELENCO }, 'BLUE', ELENCO)
    ).not.toThrow();
  });

  it('aceita elenco na ordem trocada -- a partida e um conjunto, nao uma lista', () => {
    const embaralhado = [...TIME_B, ...TIME_A];

    expect(() =>
      assertMesmaPartida({ winner: 'RED', playerIds: ELENCO }, 'RED', embaralhado)
    ).not.toThrow();
  });

  it('recusa quando a origem diz outro vencedor', () => {
    const codigo = codigoDoErro(() =>
      assertMesmaPartida({ winner: 'BLUE', playerIds: ELENCO }, 'RED', ELENCO)
    );

    expect(codigo).toBe('WINNER_MISMATCH');
  });

  it('recusa quando um jogador foi trocado por outro', () => {
    const comIntruso = [...ELENCO.slice(0, 9), 'estranho'];

    const codigo = codigoDoErro(() =>
      assertMesmaPartida({ winner: 'BLUE', playerIds: ELENCO }, 'BLUE', comIntruso)
    );

    expect(codigo).toBe('ROSTER_MISMATCH');
  });

  it('recusa quando a origem tem gente a menos', () => {
    const codigo = codigoDoErro(() =>
      assertMesmaPartida({ winner: 'BLUE', playerIds: ELENCO }, 'BLUE', ELENCO.slice(0, 9))
    );

    expect(codigo).toBe('ROSTER_MISMATCH');
  });

  it('recusa partida sem vencedor gravado', () => {
    // Partida com winner null e partida pela metade. Reescrever a scoreboard
    // dela nao conserta o registro, so espalha o problema.
    const codigo = codigoDoErro(() =>
      assertMesmaPartida({ winner: null, playerIds: ELENCO }, 'BLUE', ELENCO)
    );

    expect(codigo).toBe('WINNER_MISMATCH');
  });
});
