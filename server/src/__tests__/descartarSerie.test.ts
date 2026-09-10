import { describe, expect, it } from 'vitest';
import { assertSerieDescartavel, SeriesError } from '../services/series.js';

/**
 * A guarda do descarte de serie.
 *
 * Abrir MD3 sem querer e facil, e ate agora nao havia como desfazer -- a serie
 * vazia ficava no historico para sempre. O botao que resolve isso e, por
 * construcao, o unico caminho do app que APAGA registro; entao a regra que
 * decide se pode apagar e testada isolada do banco, igual `assertMesmaPartida`.
 *
 * A trava e estrutural e nao de permissao: mutacao de serie neste app nao pede
 * login, entao a unica garantia que vale e a que independe de quem clicou.
 */

function codigoDoErro(fn: () => void): string {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof SeriesError) return erro.code;
    throw erro;
  }
  return 'NAO_LANCOU';
}

describe('assertSerieDescartavel', () => {
  it('deixa passar a serie que nunca teve jogo', () => {
    expect(() => assertSerieDescartavel(0)).not.toThrow();
  });

  it('recusa com UM jogo gravado', () => {
    // O caso perigoso e o limite: uma noite que comecou e teve so o jogo 1
    // ainda e historico real de dez pessoas.
    expect(codigoDoErro(() => assertSerieDescartavel(1))).toBe('SERIES_NOT_EMPTY');
  });

  it('recusa a MD3 completa', () => {
    expect(codigoDoErro(() => assertSerieDescartavel(3))).toBe('SERIES_NOT_EMPTY');
  });

  it('diz quantos jogos travaram o descarte', () => {
    // "Nao pode" sem numero manda a pessoa adivinhar se abriu a serie errada.
    try {
      assertSerieDescartavel(2);
    } catch (erro) {
      expect((erro as Error).message).toContain('2 jogo(s)');
    }
  });
});
