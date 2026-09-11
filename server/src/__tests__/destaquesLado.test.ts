import { describe, expect, it } from 'vitest';
import { extrairMomentos, type LinhaCrua } from '../services/highlights.js';

/**
 * O lado do jogador viaja com o destaque.
 *
 * Os times trocam de lado entre os jogos de uma MD3, então "azul" só existe
 * por partida. A tela e as imagens pintam cada cartão pela cor do lado; se o
 * campo sumir do contexto, os cartões perdem a cor sem erro nenhum.
 */

function linha(playerId: string, teamSide: string, damage: number): LinhaCrua {
  return {
    kills: 3,
    deaths: 3,
    assists: 3,
    damage,
    damageTaken: 1000,
    goldEarned: 1000,
    visionScore: 10,
    cs: 100,
    win: teamSide === 'RED',
    teamSide,
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
      playedAt: new Date('2026-09-10T21:22:00Z'),
      seriesId: 's1',
      series: { name: 'Quinta 10/09', date: new Date('2026-09-10') },
    },
    player: { id: playerId, name: playerId },
  } as LinhaCrua;
}

describe('lado do jogador nos destaques', () => {
  it('o momento carrega o lado em que o jogador estava naquela partida', () => {
    // Quem deu muito mais dano que todo mundo vira "CARREGOU".
    const linhas = [
      linha('carregador', 'RED', 45000),
      ...['a', 'b', 'c', 'd'].map((id) => linha(id, 'RED', 9000)),
      ...['e', 'f', 'g', 'h', 'i'].map((id) => linha(id, 'BLUE', 9000)),
    ];

    const carry = extrairMomentos(linhas, () => null).find((m) => m.playerId === 'carregador');

    expect(carry).toBeDefined();
    expect(carry?.teamSide).toBe('RED');
  });
});
