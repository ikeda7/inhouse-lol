import { describe, expect, it } from 'vitest';
import { extrairMomentos, type LinhaCrua } from '../services/highlights.js';

/**
 * Extracao dos momentos da aba Destaques.
 *
 * Nove tipos, cada um com um piso. Os pisos sao a parte que precisa de teste:
 * eles existem para impedir que uma partida fraca eleja um "destaque" que nao
 * destaca nada -- "maior visao da partida" com 12 pontos, por exemplo. Se um
 * piso quebrar, a tela nao da erro: ela enche de momento sem graca, que e pior.
 */

const semIcone = () => null;

/** Linha de scoreboard com valores neutros; o teste sobrescreve o que importa. */
function linha(overrides: Partial<LinhaCrua> & { playerId: string }): LinhaCrua {
  return {
    kills: 0,
    deaths: 3,
    assists: 0,
    damage: 1000,
    damageTaken: 1000,
    goldEarned: 1000,
    visionScore: 10,
    cs: 100,
    win: true,
    teamSide: 'BLUE',
    championName: 'Ahri',
    championId: 103,
    rolePlayed: 'MID',
    largestMultiKill: 0,
    largestKillingSpree: 0,
    pentaKills: 0,
    quadraKills: 0,
    firstBloodKill: false,
    damageSelfMitigated: 1000,
    timeCCingOthers: 0,
    match: {
      id: 'm1',
      matchNumber: 1,
      gameDurationSec: 1800,
      playedAt: new Date('2026-09-07T22:00:00Z'),
      seriesId: 's1',
      series: { name: 'Domingo 07/09', date: new Date('2026-09-07') },
    },
    player: { id: overrides.playerId, name: 'Fulano' },
    ...overrides,
  } as LinhaCrua;
}

/** Os tipos emitidos para um jogador, para asserção legível. */
function tiposDe(linhas: LinhaCrua[], playerId: string): string[] {
  return extrairMomentos(linhas, semIcone)
    .filter((m) => m.playerId === playerId)
    .map((m) => m.tipo)
    .sort();
}

describe('extrairMomentos', () => {
  it('emite PENTA e QUADRA a partir do maior multikill, nunca os dois', () => {
    const comPenta = [linha({ playerId: 'a', largestMultiKill: 5 })];
    const comQuadra = [linha({ playerId: 'b', largestMultiKill: 4 })];

    expect(tiposDe(comPenta, 'a')).toContain('PENTA');
    expect(tiposDe(comPenta, 'a')).not.toContain('QUADRA');
    expect(tiposDe(comQuadra, 'b')).toContain('QUADRA');
  });

  it('nao emite momento para triple kill', () => {
    // Triple num custom de 10 acontece toda partida. Se tudo vira momento,
    // nada e momento.
    expect(tiposDe([linha({ playerId: 'a', largestMultiKill: 3 })], 'a')).not.toContain('QUADRA');
  });

  it('emite SPREE so a partir de 6 abates seguidos', () => {
    expect(tiposDe([linha({ playerId: 'a', largestKillingSpree: 5 })], 'a')).not.toContain('SPREE');
    expect(tiposDe([linha({ playerId: 'a', largestKillingSpree: 6 })], 'a')).toContain('SPREE');
  });

  it('emite multikill e sequencia juntos -- sao feitos independentes', () => {
    const tipos = tiposDe(
      [linha({ playerId: 'a', largestMultiKill: 5, largestKillingSpree: 8 })],
      'a'
    );

    expect(tipos).toContain('PENTA');
    expect(tipos).toContain('SPREE');
  });

  it('exige participacao para SEM_MORRER, senao premia quem ficou na base', () => {
    const passivo = [linha({ playerId: 'a', deaths: 0, kills: 1, assists: 2 })];
    const ativo = [linha({ playerId: 'b', deaths: 0, kills: 4, assists: 6 })];

    expect(tiposDe(passivo, 'a')).not.toContain('SEM_MORRER');
    expect(tiposDe(ativo, 'b')).toContain('SEM_MORRER');
  });

  it('da CARRY ao maior dano da partida, e so acima do piso', () => {
    const partida = [
      linha({ playerId: 'a', damage: 30000 }),
      linha({ playerId: 'b', damage: 12000 }),
    ];

    expect(tiposDe(partida, 'a')).toContain('CARRY');
    expect(tiposDe(partida, 'b')).not.toContain('CARRY');
  });

  it('nao da CARRY quando nem o maior dano da partida foi grande', () => {
    // Partida curta e fraca: ser o maior de uma lista pequena nao e feito.
    const partida = [
      linha({ playerId: 'a', damage: 9000 }),
      linha({ playerId: 'b', damage: 4000 }),
    ];

    expect(tiposDe(partida, 'a')).not.toContain('CARRY');
  });

  it('exige sofrer E mitigar para MURALHA', () => {
    // So levar porrada e morrer muito; levar e mitigar e ter segurado a frente.
    const partida = [
      linha({ playerId: 'tanque', damageTaken: 40000, damageSelfMitigated: 35000 }),
      linha({ playerId: 'papel', damageTaken: 20000, damageSelfMitigated: 5000 }),
    ];
    expect(tiposDe(partida, 'tanque')).toContain('MURALHA');

    const soApanhou = [
      linha({ playerId: 'x', damageTaken: 40000, damageSelfMitigated: 2000 }),
      linha({ playerId: 'y', damageTaken: 20000, damageSelfMitigated: 30000 }),
    ];
    expect(tiposDe(soApanhou, 'x')).not.toContain('MURALHA');
  });

  it('da VISAO ao maior da partida, e so acima do piso absoluto', () => {
    const boa = [
      linha({ playerId: 'a', visionScore: 70 }),
      linha({ playerId: 'b', visionScore: 20 }),
    ];
    expect(tiposDe(boa, 'a')).toContain('VISAO');

    // Maior da partida, mas 30 pontos nao e "olho no mapa".
    const fraca = [
      linha({ playerId: 'a', visionScore: 30 }),
      linha({ playerId: 'b', visionScore: 10 }),
    ];
    expect(tiposDe(fraca, 'a')).not.toContain('VISAO');
  });

  it('calcula FARM por minuto, nao por total', () => {
    // 200 de farm em 30min e 6.7/min (abaixo do piso); em 20min e 10/min.
    const longa = [linha({ playerId: 'a', cs: 200 })];
    expect(tiposDe(longa, 'a')).not.toContain('FARM');

    const curta = [
      linha({
        playerId: 'b',
        cs: 200,
        match: { ...linha({ playerId: 'b' }).match, gameDurationSec: 1200 },
      }),
    ];
    expect(tiposDe(curta, 'b')).toContain('FARM');
  });

  it('ordena por raridade dentro da mesma partida', () => {
    const momentos = extrairMomentos(
      [
        linha({ playerId: 'fb', firstBloodKill: true }),
        linha({ playerId: 'penta', largestMultiKill: 5 }),
      ],
      semIcone
    ).sort((a, b) => b.peso - a.peso);

    expect(momentos[0].tipo).toBe('PENTA');
    expect(momentos.at(-1)!.tipo).toBe('FIRST_BLOOD');
  });

  it('avalia superlativos por partida, nao no conjunto todo', () => {
    // O maior dano da partida 2 tambem e momento, mesmo sendo menor que o
    // maior da partida 1. Senao uma noite boa apagaria todas as outras.
    const outraPartida = { id: 'm2', matchNumber: 2 };
    const linhas = [
      linha({ playerId: 'a', damage: 45000 }),
      linha({ playerId: 'b', damage: 10000 }),
      linha({
        playerId: 'c',
        damage: 25000,
        match: { ...linha({ playerId: 'c' }).match, ...outraPartida },
      }),
      linha({
        playerId: 'd',
        damage: 9000,
        match: { ...linha({ playerId: 'd' }).match, ...outraPartida },
      }),
    ];

    expect(tiposDe(linhas, 'a')).toContain('CARRY');
    expect(tiposDe(linhas, 'c')).toContain('CARRY');
  });
});
