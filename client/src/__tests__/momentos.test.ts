import { describe, expect, it } from 'vitest';
import { harmonizarNoite } from '../lib/momentos';

// Pesos iguais aos de server/src/services/highlights.ts.
const PESO = {
  PENTA: 100,
  QUADRA: 90,
  SEM_MORRER: 70,
  SPREE: 60,
  CARRY: 50,
  MURALHA: 40,
  FARM: 30,
  VISAO: 25,
  FIRST_BLOOD: 10,
} as const;

type Tipo = keyof typeof PESO;

function momento(tipo: Tipo, valor = 1, id = `${tipo}-${valor}`) {
  return { id, tipo, valor, peso: PESO[tipo] };
}

/** A noite do print: Domingo 07/09, 13 momentos, jogo 2 antes do jogo 1. */
function domingo0709() {
  return [
    momento('SPREE', 8, 'vini-legendary'),
    momento('SPREE', 10, 'denyon-legendary'),
    momento('CARRY', 36000, 'vini-carry'),
    momento('FARM', 8, 'leo-farm'),
    momento('VISAO', 71, 'ikeda-visao-j2'),
    momento('FIRST_BLOOD', 1, 'leo-fb-j2'),
    momento('QUADRA', 4, 'leo-quadra'),
    momento('SPREE', 7, 'vini-godlike'),
    momento('SPREE', 6, 'leo-dominating'),
    momento('CARRY', 41000, 'leo-carry'),
    momento('FARM', 7.7, 'vini-farm'),
    momento('VISAO', 97, 'ikeda-visao-j1'),
    momento('FIRST_BLOOD', 1, 'vini-fb-j1'),
  ];
}

const ids = (itens: { id: string }[]) => itens.map((m) => m.id);

describe('harmonizarNoite', () => {
  it('fecha a noite de 13 em 12, tirando o repetido de menor peso', () => {
    const { itens, primeiroLargoNoTablet } = harmonizarNoite(domingo0709());

    expect(itens).toHaveLength(12);
    // Dois first bloods: sai o do jogo mais antigo, que vem por último.
    expect(ids(itens)).not.toContain('vini-fb-j1');
    expect(ids(itens)).toContain('leo-fb-j2');
    expect(ids(itens)).toContain('leo-quadra');
    // 12 fecha em 1, 2 e 3 colunas sem esticar ninguém.
    expect(primeiroLargoNoTablet).toBe(false);
  });

  it('não mexe em noite que já fecha em múltiplo de 6', () => {
    const noite = domingo0709().slice(0, 12);
    const { itens, primeiroLargoNoTablet } = harmonizarNoite(noite);

    expect(ids(itens)).toEqual(ids(noite));
    expect(primeiroLargoNoTablet).toBe(false);
  });

  it('com 9, não corta: fecha o desktop e estica o primeiro cartão no tablet', () => {
    const noite = domingo0709().slice(0, 9);
    const { itens, primeiroLargoNoTablet } = harmonizarNoite(noite);

    expect(itens).toHaveLength(9);
    expect(primeiroLargoNoTablet).toBe(true);
  });

  it('com 10 ou 11, desce para 9 em vez de cortar até 6', () => {
    expect(harmonizarNoite(domingo0709().slice(0, 10)).itens).toHaveLength(9);
    expect(harmonizarNoite(domingo0709().slice(0, 11)).itens).toHaveLength(9);
  });

  it('com 14, corta 2 e chega a 12', () => {
    const noite = [...domingo0709(), momento('MURALHA', 50000, 'muralha-1')];
    expect(harmonizarNoite(noite).itens).toHaveLength(12);
  });

  it('nunca corta noite com menos de 6 momentos', () => {
    const noite = domingo0709().slice(0, 5);
    const { itens, primeiroLargoNoTablet } = harmonizarNoite(noite);

    expect(ids(itens)).toEqual(ids(noite));
    expect(primeiroLargoNoTablet).toBe(false);
  });

  it('nunca tira quadra nem penta, mesmo repetidas', () => {
    const noite = [
      momento('PENTA', 5, 'penta-a'),
      momento('PENTA', 5, 'penta-b'),
      momento('QUADRA', 4, 'quadra-a'),
      momento('QUADRA', 4, 'quadra-b'),
      momento('SPREE', 8, 'spree'),
      momento('CARRY', 30000, 'carry'),
      momento('FIRST_BLOOD', 1, 'fb'),
    ];
    // 7 pediria 1 corte, mas não há repetido que possa sair: fica como está.
    expect(ids(harmonizarNoite(noite).itens)).toEqual(ids(noite));
  });

  it('tipo que aparece uma vez só não sai, mesmo sendo o de menor peso', () => {
    const noite = [
      momento('SPREE', 8, 'spree-forte'),
      momento('SPREE', 6, 'spree-fraca'),
      momento('CARRY', 30000, 'carry'),
      momento('MURALHA', 40000, 'muralha'),
      momento('FARM', 8, 'farm'),
      momento('VISAO', 60, 'visao'),
      momento('FIRST_BLOOD', 1, 'fb-unico'),
    ];
    const { itens } = harmonizarNoite(noite);

    expect(ids(itens)).toContain('fb-unico');
    // O único repetido é a sequência, e sai a menor das duas.
    expect(ids(itens)).not.toContain('spree-fraca');
    expect(ids(itens)).toContain('spree-forte');
  });

  it('não corta pela metade quando não há repetido suficiente', () => {
    // 8 pede 2 cortes; só existe 1 repetido. Cortar 1 deixaria 7, tão
    // quebrado quanto 8 e com um momento a menos.
    const noite = [
      momento('QUADRA', 4, 'quadra'),
      momento('SPREE', 8, 'spree-a'),
      momento('SPREE', 6, 'spree-b'),
      momento('SEM_MORRER', 12, 'sem-morrer'),
      momento('CARRY', 30000, 'carry'),
      momento('MURALHA', 40000, 'muralha'),
      momento('FARM', 8, 'farm'),
      momento('FIRST_BLOOD', 1, 'fb'),
    ];
    expect(ids(harmonizarNoite(noite).itens)).toEqual(ids(noite));
  });

  it('preserva a ordem e não altera a lista recebida', () => {
    const noite = domingo0709();
    const copia = [...noite];
    const { itens } = harmonizarNoite(noite);

    expect(noite).toEqual(copia);
    expect(ids(itens)).toEqual(ids(noite).filter((id) => id !== 'vini-fb-j1'));
  });
});
