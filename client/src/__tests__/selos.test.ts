import { describe, expect, it } from 'vitest';
import { conquistasEmOrdem, selosDaPartida, type SeloId } from '../lib/selos';
import type { Role } from '../types';

type Linha = Parameters<typeof selosDaPartida>[0][number];

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

/** Dez jogadores sem nada de especial: todo mundo empata em tudo. */
function partidaNeutra(): Linha[] {
  return Array.from({ length: 10 }, (_, i) => ({
    playerId: `p${i}`,
    rolePlayed: ROLES[i % 5],
    kills: 3,
    damage: 15000,
    damageTaken: 20000,
    visionScore: 20,
    cs: 150,
    goldEarned: 10000,
    assists: 5,
    deaths: 5,
    firstBloodKill: false,
  }));
}

function com(linhas: Linha[], playerId: string, mudanca: Partial<Linha>): Linha[] {
  return linhas.map((l) => (l.playerId === playerId ? { ...l, ...mudanca } : l));
}

const idsDe = (mapa: ReturnType<typeof selosDaPartida>, playerId: string): SeloId[] =>
  (mapa.get(playerId) ?? []).map((c) => c.selo.id);

describe('selosDaPartida', () => {
  it('empate em tudo não dá selo para ninguém', () => {
    expect(selosDaPartida(partidaNeutra()).size).toBe(0);
  });

  it('dá o selo ao único extremo, com o valor que valeu', () => {
    const linhas = com(com(partidaNeutra(), 'p3', { damage: 31000 }), 'p7', { deaths: 11 });
    const mapa = selosDaPartida(linhas);

    expect(idsDe(mapa, 'p3')).toContain('maisDano');
    expect(mapa.get('p3')?.find((c) => c.selo.id === 'maisDano')?.valor).toBe(31000);
    expect(idsDe(mapa, 'p7')).toContain('maisMortes');
  });

  it('empate no topo não dá selo: três com o mesmo dano não são "o que mais deu"', () => {
    let linhas = partidaNeutra();
    for (const id of ['p0', 'p1', 'p2']) linhas = com(linhas, id, { damage: 30000 });
    const mapa = selosDaPartida(linhas);

    for (const id of ['p0', 'p1', 'p2']) expect(idsDe(mapa, id)).not.toContain('maisDano');
  });

  it('menos mortes aceita zero: quem não morreu leva o Intocável', () => {
    const mapa = selosDaPartida(com(partidaNeutra(), 'p2', { deaths: 0 }));
    const intocavel = mapa.get('p2')?.find((c) => c.selo.id === 'intocavel');

    expect(intocavel?.valor).toBe(0);
    expect(intocavel?.selo.descrever(0)).toBe('não morreu nenhuma vez');
  });

  it('Pacifista ignora o suporte, que dá pouco dano por função', () => {
    // p4 é suporte e dá o menor dano de todos; o selo tem de ir para p1.
    let linhas = com(partidaNeutra(), 'p4', { damage: 4000 });
    linhas = com(linhas, 'p1', { damage: 9000 });
    const mapa = selosDaPartida(linhas);

    expect(idsDe(mapa, 'p4')).not.toContain('pacifista');
    expect(idsDe(mapa, 'p1')).toContain('pacifista');
  });

  it('coluna zerada (importação antiga) não gera selo de máximo', () => {
    const semVisao = partidaNeutra().map((l) => ({ ...l, visionScore: 0 }));
    const mapa = selosDaPartida(semVisao);

    for (const lista of mapa.values()) {
      expect(lista.map((c) => c.selo.id)).not.toContain('visao');
    }
  });

  it('mantém a ordem de exibição: mérito antes da zoeira', () => {
    const linhas = com(partidaNeutra(), 'p5', { damage: 40000, deaths: 12 });
    expect(idsDe(selosDaPartida(linhas), 'p5')).toEqual(['maisDano', 'maisMortes']);
  });
});

describe('número par de selos', () => {
  const total = (mapa: ReturnType<typeof selosDaPartida>) =>
    [...mapa.values()].reduce((soma, lista) => soma + lista.length, 0);

  it('ímpar é completado pelo primeiro selo de reserva com dono único', () => {
    // Um selo só (mais dano, de p3) e um KDA claramente melhor em p8 -- com as
    // mesmas mortes de todo mundo, para p8 não levar o "Intocável" (que já
    // fecharia o par sozinho).
    let linhas = com(partidaNeutra(), 'p3', { damage: 31000 });
    linhas = com(linhas, 'p8', { kills: 20 });
    const mapa = selosDaPartida(linhas);

    expect(total(mapa)).toBe(2);
    expect(idsDe(mapa, 'p8')).toEqual(['melhorKda']);
  });

  it('pula a reserva empatada e usa a próxima', () => {
    // KDA empatado em todo mundo; p6 abriu o placar (first blood é único por natureza).
    let linhas = com(partidaNeutra(), 'p3', { damage: 31000 });
    linhas = com(linhas, 'p6', { firstBloodKill: true });
    const mapa = selosDaPartida(linhas);

    expect(idsDe(mapa, 'p6')).toEqual(['firstBlood']);
    expect(total(mapa)).toBe(2);
  });

  it('par já fechado não ganha reserva', () => {
    let linhas = com(partidaNeutra(), 'p3', { damage: 31000 });
    linhas = com(linhas, 'p7', { deaths: 11 });
    linhas = com(linhas, 'p8', { kills: 20 });
    const mapa = selosDaPartida(linhas);

    // mais dano + mais mortes = 2; o "mais abates" de p8 não entra.
    expect(total(mapa)).toBe(2);
    expect(idsDe(mapa, 'p8')).toEqual([]);
  });

  it('sem reserva com dono único, fica ímpar -- não inventa selo', () => {
    const mapa = selosDaPartida(com(partidaNeutra(), 'p3', { damage: 31000 }));
    expect(total(mapa)).toBe(1);
  });
});

describe('conquistasEmOrdem', () => {
  it('lista cada selo uma vez, na ordem de exibição, com o nome do dono', () => {
    let linhas = com(partidaNeutra(), 'p7', { deaths: 11 });
    linhas = com(linhas, 'p3', { damage: 31000 });
    const comNome = linhas.map((l) => ({ ...l, player: { name: `Jogador ${l.playerId}` } }));

    const lista = conquistasEmOrdem(selosDaPartida(comNome), comNome);

    // Mais dano vem antes de Mais mortes, mesmo p7 aparecendo depois no mapa.
    expect(lista.map((c) => [c.selo.id, c.nome])).toEqual([
      ['maisDano', 'Jogador p3'],
      ['maisMortes', 'Jogador p7'],
    ]);
  });
});
