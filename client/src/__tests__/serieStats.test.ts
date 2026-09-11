import { describe, expect, it } from 'vitest';
import { estatisticasDaSerie, kdaNaSerie, porMinuto, selosDaMd3 } from '../lib/serieStats';
import type { MatchStat, Role, SeriesDetail, TeamSide } from '../types';

type Partida = SeriesDetail['matches'][number];

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const A = ['a1', 'a2', 'a3', 'a4', 'a5'];
const B = ['b1', 'b2', 'b3', 'b4', 'b5'];

function linha(id: string, lado: TeamSide, posicao: number, extra: Partial<MatchStat>): MatchStat {
  return {
    id: `${id}-${lado}`,
    playerId: id,
    player: { id, name: id.toUpperCase() },
    teamSide: lado,
    rolePlayed: ROLES[posicao % 5],
    championName: `Campeao-${id}`,
    kills: 2,
    deaths: 2,
    assists: 2,
    damage: 10000,
    damageTaken: 10000,
    goldEarned: 8000,
    visionScore: 20,
    cs: 150,
    win: false,
    firstBloodKill: false,
    ...extra,
  } as MatchStat;
}

/** Um jogo: `azul` joga de azul, `vermelho` de vermelho; `extra` muda linhas por jogador. */
function jogo(
  numero: number,
  azul: string[],
  vermelho: string[],
  vencedor: TeamSide,
  extra: Record<string, Partial<MatchStat>> = {}
): Partida {
  const lado = (ids: string[], cor: TeamSide) =>
    ids.map((id, i) => linha(id, cor, i, { win: vencedor === cor, ...extra[id] }));
  return {
    id: `m${numero}`,
    matchNumber: numero,
    winner: vencedor,
    gameDurationSec: 1800,
    playedAt: '2026-09-10T22:00:00.000Z',
    source: 'MANUAL',
    gameVersion: null,
    surrendered: false,
    stats: [...lado(azul, 'BLUE'), ...lado(vermelho, 'RED')],
    teams: [],
    bans: [],
  };
}

const achar = (jogadores: ReturnType<typeof estatisticasDaSerie>, id: string) =>
  jogadores.find((jogador) => jogador.playerId === id)!;

describe('estatisticasDaSerie', () => {
  it('soma por elenco: quem trocou de lado continua no time A', () => {
    // Jogo 2: o time A joga de vermelho, e vence.
    const jogadores = estatisticasDaSerie([jogo(1, A, B, 'BLUE'), jogo(2, B, A, 'RED')]);
    const a1 = achar(jogadores, 'a1');

    expect(a1.time).toBe('A');
    expect(a1.jogos).toBe(2);
    expect(a1.vitorias).toBe(2);
    expect(a1.kills).toBe(4);
    expect(a1.minutos).toBe(60);
    expect(
      jogadores
        .filter((j) => j.time === 'A')
        .map((j) => j.playerId)
        .sort()
    ).toEqual(A);
  });

  it('o substituto fica no time de quem saiu, e nenhum dos dois conta como completo', () => {
    const comReserva = ['a1', 'a2', 'a3', 'a4', 's1'];
    const jogadores = estatisticasDaSerie([jogo(1, A, B, 'BLUE'), jogo(2, B, comReserva, 'RED')]);

    expect(achar(jogadores, 's1').time).toBe('A');
    expect(achar(jogadores, 's1').completo).toBe(false);
    expect(achar(jogadores, 'a5').completo).toBe(false);
    expect(achar(jogadores, 'a1').completo).toBe(true);
  });

  it('campeões na ordem dos jogos; role que mais jogou, e no empate a do primeiro jogo', () => {
    const jogadores = estatisticasDaSerie([
      jogo(1, A, B, 'BLUE', { a1: { championName: 'Garen' } }),
      jogo(2, B, A, 'RED', { a1: { championName: 'Darius', rolePlayed: 'MID' } }),
      jogo(3, A, B, 'BLUE', { a2: { rolePlayed: 'MID' } }),
    ]);

    expect(achar(jogadores, 'a1').campeoes).toEqual(['Garen', 'Darius', 'Campeao-a1']);
    expect(achar(jogadores, 'a1').rolePlayed).toBe('TOP');
    expect(achar(jogadores, 'a2').rolePlayed).toBe('JUNGLE');
  });

  it('time A primeiro e, dentro do time, na ordem das lanes', () => {
    const jogadores = estatisticasDaSerie([jogo(1, A, B, 'BLUE')]);
    expect(jogadores.map((j) => j.playerId)).toEqual([...A, ...B]);
  });

  it('jogo sem estatística não conta, e série vazia não tem ninguém', () => {
    const semStats = { ...jogo(2, B, A, 'RED'), stats: [] };
    const jogadores = estatisticasDaSerie([jogo(1, A, B, 'BLUE'), semStats]);

    expect(achar(jogadores, 'a1').jogos).toBe(1);
    expect(achar(jogadores, 'a1').completo).toBe(true);
    expect(estatisticasDaSerie([])).toEqual([]);
  });
});

describe('selosDaMd3', () => {
  it('quem jogou só um jogo não disputa, nem com o maior dano do jogo', () => {
    const comReserva = ['a1', 'a2', 'a3', 'a4', 's1'];
    const jogadores = estatisticasDaSerie([
      jogo(1, A, B, 'BLUE', { a1: { damage: 30000 } }),
      jogo(2, B, comReserva, 'RED', { a1: { damage: 30000 }, s1: { damage: 99000 } }),
    ]);
    const selos = selosDaMd3(jogadores);
    const doA1 = selos.get('a1')?.find((c) => c.selo.id === 'maisDano');

    expect(selos.has('s1')).toBe(false);
    expect(doA1?.valor).toBe(60000);
    expect(doA1?.selo.descrever(60000)).toContain('o maior da MD3');
  });

  it('first blood é de um jogo e não vira selo da MD3', () => {
    const jogadores = estatisticasDaSerie([
      jogo(1, A, B, 'BLUE', { a1: { firstBloodKill: true } }),
      jogo(2, B, A, 'RED'),
    ]);
    const ids = [...selosDaMd3(jogadores).values()].flat().map((c) => c.selo.id);

    expect(ids).not.toContain('firstBlood');
  });
});

describe('por minuto e KDA', () => {
  it('sem duração conhecida não inventa por-minuto', () => {
    expect(porMinuto(9000, 0)).toBeNull();
    expect(porMinuto(9000, 30)).toBe(300);
  });

  it('KDA sem morte divide por um, como no jogo', () => {
    expect(kdaNaSerie({ kills: 6, deaths: 0, assists: 4 })).toBe(10);
  });
});
