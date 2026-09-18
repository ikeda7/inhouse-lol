import { describe, expect, it } from 'vitest';
import { estatisticasDeCampeao } from '../lib/estatisticasDeCampeao.js';

const pick = (championName: string, win = false) => ({ championName, championId: null, win });
const ban = (championName: string) => ({ championName, championId: null });
const vezes = <T>(n: number, item: T) => Array.from({ length: n }, () => item);

describe('estatísticas de campeão', () => {
  it('pick rate e ban rate saem sobre o total de partidas, não sobre as escolhas', () => {
    const [lux] = estatisticasDeCampeao(vezes(3, pick('Lux')), vezes(1, ban('Lux')), 10);
    expect(lux).toMatchObject({ pickRate: 30, banRate: 10, presenca: 40, partidas: 3, bans: 1 });
  });

  it('campeão só banido aparece, com winrate nulo em vez de zero', () => {
    const [zed] = estatisticasDeCampeao([], vezes(4, ban('Zed')), 8);
    expect(zed).toMatchObject({ championName: 'Zed', partidas: 0, bans: 4, winRate: null });
  });

  it('ordena por presença, e no empate quem foi mais escolhido vem antes', () => {
    const lista = estatisticasDeCampeao(
      [...vezes(4, pick('Ashe')), ...vezes(1, pick('Zed'))],
      [...vezes(1, ban('Ashe')), ...vezes(4, ban('Zed'))],
      10
    );
    expect(lista.map((c) => c.championName)).toEqual(['Ashe', 'Zed']);
  });

  it('winrate é sobre as partidas do campeão, não sobre o total', () => {
    const [ashe] = estatisticasDeCampeao(
      [pick('Ashe', true), pick('Ashe', true), pick('Ashe', false), pick('Ashe', false)],
      [],
      20
    );
    expect(ashe).toMatchObject({ winRate: 50, pickRate: 20 });
  });

  it('id do campeão vem de qualquer origem que tenha (o .rofl manda nome, o LCU manda número)', () => {
    const [ahri] = estatisticasDeCampeao(
      [pick('Ahri'), { championName: 'Ahri', championId: 103, win: true }],
      [],
      2
    );
    expect(ahri.championId).toBe(103);
  });

  it('sem partida nenhuma não divide por zero', () => {
    expect(estatisticasDeCampeao([], [], 0)).toEqual([]);
    const [lux] = estatisticasDeCampeao([pick('Lux')], [], 0);
    expect(lux).toMatchObject({ pickRate: 0, presenca: 0 });
  });
});
