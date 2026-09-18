import { describe, expect, it } from 'vitest';
import {
  JOGOS_MINIMOS_DO_CAMPEAO,
  recordesDeCampeao,
  type LinhaDeCampeao,
} from '../lib/recordesDeCampeao.js';

/** Uma partida de alguém com um campeão. */
function jogo(
  playerId: string,
  championName: string,
  placar: { k?: number; d?: number; a?: number; win?: boolean } = {}
): LinhaDeCampeao {
  return {
    playerId,
    playerName: playerId,
    championName,
    championId: null,
    kills: placar.k ?? 0,
    deaths: placar.d ?? 0,
    assists: placar.a ?? 0,
    win: placar.win ?? false,
  };
}

const vezes = (n: number, linha: LinhaDeCampeao) => Array.from({ length: n }, () => linha);
const pegar = (linhas: LinhaDeCampeao[], categoria: string) =>
  recordesDeCampeao(linhas).find((recorde) => recorde.categoria === categoria);

describe('recordes de campeão', () => {
  it('soma por pessoa E por campeão: dois campeões do mesmo dono não viram um', () => {
    const linhas = [
      ...vezes(3, jogo('ana', 'Teemo', { k: 2 })),
      ...vezes(3, jogo('ana', 'Lux', { k: 9 })),
    ];
    const abates = pegar(linhas, 'campeaoKills');
    expect(abates).toMatchObject({ playerId: 'ana', championName: 'Lux', valor: 27, jogos: 3 });
  });

  it('o mais jogado é o par pessoa+campeão com mais partidas', () => {
    const linhas = [...vezes(5, jogo('ana', 'Teemo')), ...vezes(4, jogo('bia', 'Lux'))];
    expect(pegar(linhas, 'campeaoMaisJogado')).toMatchObject({
      playerId: 'ana',
      championName: 'Teemo',
      valor: 5,
    });
  });

  it(`winrate e KDA exigem ${JOGOS_MINIMOS_DO_CAMPEAO} jogos: um 1-0 não é aproveitamento`, () => {
    const linhas = [
      jogo('sortudo', 'Yasuo', { win: true, k: 20 }),
      ...vezes(3, jogo('constante', 'Garen', { win: true, k: 1, d: 1 })),
    ];
    expect(pegar(linhas, 'campeaoWinrate')).toMatchObject({
      playerId: 'constante',
      championName: 'Garen',
      valor: 100,
    });
    expect(pegar(linhas, 'campeaoKda')?.playerId).toBe('constante');
  });

  it('KDA sem morrer não divide por zero, e conta como se tivesse morrido uma vez', () => {
    const linhas = vezes(3, jogo('ana', 'Lux', { k: 5, a: 5, d: 0 }));
    expect(pegar(linhas, 'campeaoKda')).toMatchObject({ valor: 30 });
  });

  it('mortes é recorde de zoeira e sai separado dos outros', () => {
    const linhas = [
      ...vezes(3, jogo('ana', 'Teemo', { d: 10 })),
      ...vezes(3, jogo('bia', 'Lux', { d: 2 })),
    ];
    expect(pegar(linhas, 'campeaoMortes')).toMatchObject({
      playerId: 'ana',
      championName: 'Teemo',
      valor: 30,
    });
  });

  it('empate de winrate fica com quem jogou mais vezes', () => {
    const linhas = [
      ...vezes(3, jogo('ana', 'Teemo', { win: true })),
      ...vezes(6, jogo('bia', 'Lux', { win: true })),
    ];
    expect(pegar(linhas, 'campeaoWinrate')).toMatchObject({ playerId: 'bia', jogos: 6 });
  });

  it('sem partidas suficientes, a categoria simplesmente não aparece', () => {
    const recordes = recordesDeCampeao([jogo('ana', 'Teemo', { k: 3 })]);
    expect(recordes.map((r) => r.categoria)).toEqual(
      expect.not.arrayContaining(['campeaoWinrate', 'campeaoKda'])
    );
    expect(recordes.find((r) => r.categoria === 'campeaoKills')).toBeDefined();
  });

  it('sem nenhuma partida, devolve lista vazia em vez de quebrar', () => {
    expect(recordesDeCampeao([])).toEqual([]);
  });
});
