import { describe, expect, it } from 'vitest';
import {
  MAX_DIVISOES_EVITADAS,
  chaveDoElenco,
  divisoesAEvitar,
  registrarDivisao,
} from '../lib/divisoes';

const ELENCO = chaveDoElenco(['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);

describe('divisões já mostradas no sorteio', () => {
  it('a chave do elenco não depende da ordem em que as pessoas foram marcadas', () => {
    expect(chaveDoElenco(['b', 'a'])).toBe(chaveDoElenco(new Set(['a', 'b'])));
  });

  it('só evita divisões do mesmo elenco: trocar quem veio zera a lista', () => {
    const vistas = { elenco: ELENCO, times: [['a', 'b', 'c', 'd', 'e']] };
    expect(divisoesAEvitar(vistas, ELENCO)).toEqual([['a', 'b', 'c', 'd', 'e']]);
    expect(divisoesAEvitar(vistas, chaveDoElenco(['outro']))).toEqual([]);
    expect(divisoesAEvitar(null, ELENCO)).toEqual([]);
  });

  it('cada sorteio novo entra na lista', () => {
    const primeira = registrarDivisao(
      [],
      ['a', 'b', 'c', 'd', 'e'],
      ['f', 'g', 'h', 'i', 'j'],
      ELENCO
    );
    const segunda = registrarDivisao(
      primeira.times,
      ['a', 'b', 'c', 'd', 'f'],
      ['e', 'g', 'h', 'i', 'j'],
      ELENCO
    );
    expect(segunda.times).toHaveLength(2);
  });

  it('divisão repetida (vermelho de agora era um azul de antes) recomeça a lista', () => {
    const vistas = [
      ['a', 'b', 'c', 'd', 'e'],
      ['a', 'b', 'c', 'd', 'f'],
    ];
    const depois = registrarDivisao(
      vistas,
      ['f', 'g', 'h', 'i', 'j'],
      ['e', 'd', 'c', 'b', 'a'],
      ELENCO
    );
    expect(depois.times).toEqual([['f', 'g', 'h', 'i', 'j']]);
  });

  it('a lista não passa do teto que a rota aceita', () => {
    let times: string[][] = [];
    for (let i = 0; i < MAX_DIVISOES_EVITADAS + 5; i++) {
      times = registrarDivisao(times, [`azul${i}`], [`vermelho${i}`], ELENCO).times;
    }
    expect(times).toHaveLength(MAX_DIVISOES_EVITADAS);
    expect(MAX_DIVISOES_EVITADAS).toBeLessThanOrEqual(50);
  });
});
