import { describe, expect, it } from 'vitest';
import {
  momentosDaNoite,
  momentosDaUltimaNoite,
  noitesComMomentos,
  porJogo,
  porLado,
} from '../lib/imagem/momentos';
import type { MomentEntry } from '../types';

/**
 * O que decide O QUE entra na imagem dos momentos. O desenho só se confere num
 * navegador de verdade (jsdom não tem canvas).
 */

function momento(seriesId: string, matchNumber: number, tipo: MomentEntry['tipo']): MomentEntry {
  return {
    playerId: `p-${seriesId}-${matchNumber}-${tipo}`,
    playerName: 'Alguém',
    championName: 'Ahri',
    ddragonId: null,
    rolePlayed: 'MID',
    teamSide: 'BLUE',
    matchId: `m-${seriesId}-${matchNumber}`,
    matchNumber,
    seriesId,
    seriesName: seriesId,
    playedAt: '2026-09-10T21:00:00.000Z',
    tipo,
    valor: 1,
    peso: 10,
    kills: 1,
    deaths: 0,
    assists: 1,
    win: true,
  };
}

describe('momentosDaUltimaNoite', () => {
  it('fica só com a noite mais recente -- a primeira da lista', () => {
    const lista = [
      momento('quinta', 2, 'CARRY'),
      momento('quinta', 1, 'SPREE'),
      momento('segunda', 1, 'PENTA'),
    ];
    expect(momentosDaUltimaNoite(lista).map((m) => m.seriesId)).toEqual(['quinta', 'quinta']);
  });

  it('sem momento nenhum, devolve vazio em vez de quebrar', () => {
    expect(momentosDaUltimaNoite([])).toEqual([]);
  });
});

describe('noitesComMomentos', () => {
  it('lista TODAS as noites, da mais recente para a mais antiga, com os jogos de cada uma', () => {
    // O seletor dos Destaques só oferecia a última noite; as outras datas
    // ficavam sem aba nenhuma.
    const lista = [
      momento('quinta', 2, 'CARRY'),
      momento('quinta', 1, 'SPREE'),
      momento('segunda', 2, 'FARM'),
      momento('segunda', 1, 'PENTA'),
      momento('segunda', 2, 'VISAO'),
    ];

    expect(noitesComMomentos(lista)).toEqual([
      { seriesId: 'quinta', nome: 'quinta', jogos: [1, 2] },
      { seriesId: 'segunda', nome: 'segunda', jogos: [1, 2] },
    ]);
  });

  it('pega os momentos de uma noite antiga, não só da última', () => {
    const lista = [momento('quinta', 1, 'CARRY'), momento('segunda', 1, 'PENTA')];
    expect(momentosDaNoite(lista, 'segunda').map((m) => m.tipo)).toEqual(['PENTA']);
  });
});

describe('porJogo', () => {
  it('separa por jogo na ordem em que foram jogados, mantendo a ordem dentro do jogo', () => {
    const lista = [
      momento('quinta', 2, 'CARRY'),
      momento('quinta', 1, 'SPREE'),
      momento('quinta', 2, 'VISAO'),
      momento('quinta', 1, 'FARM'),
    ];

    const grupos = porJogo(lista);

    expect(grupos.map((g) => g.jogo)).toEqual([1, 2]);
    expect(grupos[0].momentos.map((m) => m.tipo)).toEqual(['SPREE', 'FARM']);
    expect(grupos[1].momentos.map((m) => m.tipo)).toEqual(['CARRY', 'VISAO']);
  });
});

describe('porLado', () => {
  it('azul primeiro, cada lado com o resultado dele, e lado vazio fica de fora', () => {
    const vermelho = { ...momento('quinta', 1, 'CARRY'), teamSide: 'RED' as const, win: false };
    const azul = { ...momento('quinta', 1, 'SPREE'), teamSide: 'BLUE' as const, win: true };

    expect(porLado([vermelho, azul]).map((g) => [g.lado, g.venceu, g.momentos.length])).toEqual([
      ['BLUE', true, 1],
      ['RED', false, 1],
    ]);
    expect(porLado([azul]).map((g) => g.lado)).toEqual(['BLUE']);
  });
});
