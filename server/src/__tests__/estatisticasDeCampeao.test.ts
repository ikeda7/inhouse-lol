import { describe, expect, it } from 'vitest';
import {
  estatisticasDeCampeao,
  recordesDosCampeoes,
  JOGOS_MINIMOS_DO_RECORDE,
  type EscolhaDeCampeao,
} from '../lib/estatisticasDeCampeao.js';

const pick = (championName: string, extra: Partial<EscolhaDeCampeao> = {}): EscolhaDeCampeao => ({
  championName,
  championId: null,
  win: false,
  kills: 0,
  deaths: 0,
  assists: 0,
  damage: 0,
  duracaoEmSegundos: 1800,
  playerId: 'p1',
  playerName: 'Ana',
  ...extra,
});
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
    expect(zed.kda).toBeNull();
  });

  it('ordena por presença, e no empate quem foi mais escolhido vem antes', () => {
    const lista = estatisticasDeCampeao(
      [...vezes(4, pick('Ashe')), ...vezes(1, pick('Zed'))],
      [...vezes(1, ban('Ashe')), ...vezes(4, ban('Zed'))],
      10
    );
    expect(lista.map((c) => c.championName)).toEqual(['Ashe', 'Zed']);
  });

  it('KDA e dano por minuto são médias das partidas daquele campeão', () => {
    const [ashe] = estatisticasDeCampeao(
      [
        pick('Ashe', { kills: 5, deaths: 2, assists: 5, damage: 30000, duracaoEmSegundos: 1800 }),
        pick('Ashe', { kills: 5, deaths: 2, assists: 5, damage: 30000, duracaoEmSegundos: 1800 }),
      ],
      [],
      4
    );
    // (5+5)/2 mortes = 5 de KDA; 30000 em 30 min = 1000 por minuto.
    expect(ashe).toMatchObject({ kda: 5, danoPorMinuto: 1000 });
  });

  it('sem morrer não vira infinito: conta como uma morte, igual ao KDA do perfil', () => {
    const [lux] = estatisticasDeCampeao([pick('Lux', { kills: 4, assists: 2, deaths: 0 })], [], 1);
    expect(lux.kda).toBe(6);
  });

  it('diz quem mais joga o campeão, com quantas vezes', () => {
    const [lux] = estatisticasDeCampeao(
      [
        pick('Lux', { playerId: 'a', playerName: 'Ana' }),
        pick('Lux', { playerId: 'b', playerName: 'Bia' }),
        pick('Lux', { playerId: 'b', playerName: 'Bia' }),
      ],
      [],
      3
    );
    expect(lux.quemMaisJoga).toEqual({ playerId: 'b', name: 'Bia', jogos: 2 });
  });

  it('sem partida nenhuma não divide por zero', () => {
    expect(estatisticasDeCampeao([], [], 0)).toEqual([]);
    const [lux] = estatisticasDeCampeao([pick('Lux')], [], 0);
    expect(lux).toMatchObject({ pickRate: 0, presenca: 0 });
  });
});

describe('recordes dos campeões', () => {
  const lista = () =>
    estatisticasDeCampeao(
      [
        // Lux: 4 jogos, 3 vitórias, KDA alto
        ...vezes(3, pick('Lux', { win: true, kills: 8, deaths: 2, assists: 4 })),
        pick('Lux', { win: false, kills: 2, deaths: 4, assists: 1 }),
        // Teemo: 3 jogos, 0 vitórias
        ...vezes(3, pick('Teemo', { win: false, kills: 1, deaths: 9, assists: 1 })),
        // Yasuo: 1 jogo, 1 vitória -- não tem histórico para recorde de taxa
        pick('Yasuo', { win: true, kills: 20, deaths: 0, assists: 0 }),
      ],
      [...vezes(9, ban('Zed')), ...vezes(2, ban('Lux'))],
      12
    );

  const pegar = (categoria: string) =>
    recordesDosCampeoes(lista()).find((r) => r.categoria === categoria);

  it('o mais escolhido e o mais banido são campeões, não pessoas', () => {
    expect(pegar('maisEscolhido')).toMatchObject({ championName: 'Lux', valor: 4 });
    expect(pegar('maisBanido')).toMatchObject({ championName: 'Zed', valor: 9 });
    expect(pegar('maisEscolhido')).not.toHaveProperty('playerName');
  });

  it('presença junta pick e ban: o banido toda noite lidera mesmo jogando pouco', () => {
    expect(pegar('maiorPresenca')?.championName).toBe('Zed');
  });

  it(`winrate e KDA pedem ${JOGOS_MINIMOS_DO_RECORDE} jogos: um 1-0 não é aproveitamento`, () => {
    expect(pegar('melhorWinrate')).toMatchObject({ championName: 'Lux', valor: 75 });
    expect(pegar('melhorKda')?.championName).toBe('Lux');
    expect(pegar('piorWinrate')).toMatchObject({ championName: 'Teemo', valor: 0 });
  });

  it('sem campeão nenhum, devolve lista vazia em vez de quebrar', () => {
    expect(recordesDosCampeoes([])).toEqual([]);
  });
});
