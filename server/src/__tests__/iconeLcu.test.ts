import { describe, expect, it } from 'vitest';
import { mapLcuGame, type LcuGame } from '../lib/lcu.js';

/**
 * O cliente do LoL manda o ícone de invocador de cada participante junto com a
 * partida. É o que permite dar foto a quem joga sem depender da chave da Riot
 * (que em produção não existe). O parser tem de repassar o ícone -- e não
 * inventar um quando a origem (replay) não traz.
 */

function jogo(icones: (number | undefined)[]): LcuGame {
  const lanes = [
    { lane: 'TOP', role: 'SOLO' },
    { lane: 'JUNGLE', role: 'NONE' },
    { lane: 'MIDDLE', role: 'SOLO' },
    { lane: 'BOTTOM', role: 'DUO_CARRY' },
    { lane: 'BOTTOM', role: 'DUO_SUPPORT' },
  ];

  return {
    gameId: 2800000999,
    platformId: 'BR1',
    gameCreation: 1_700_000_000_000,
    gameDuration: 1800,
    gameType: 'CUSTOM_GAME',
    gameMode: 'CLASSIC',
    queueId: 0,
    participants: Array.from({ length: 10 }, (_, i) => ({
      participantId: i + 1,
      championId: 100 + i,
      teamId: i < 5 ? 100 : 200,
      timeline: lanes[i % 5],
      stats: { kills: 1, deaths: 1, assists: 1, win: i < 5 },
    })),
    participantIdentities: Array.from({ length: 10 }, (_, i) => ({
      participantId: i + 1,
      player: {
        puuid: `puuid-${i + 1}`,
        gameName: `Jogador${i + 1}`,
        tagLine: 'BR1',
        summonerName: `Jogador${i + 1}`,
        ...(icones[i] !== undefined ? { profileIcon: icones[i] } : {}),
      },
    })),
    teams: [
      { teamId: 100, win: 'Win' },
      { teamId: 200, win: 'Fail' },
    ],
  };
}

describe('ícone de invocador na partida do LCU', () => {
  it('repassa o ícone de cada participante', () => {
    const icones = [4567, 29, 5000, 1, 2, 3, 4, 5, 6, 7];
    const { participants } = mapLcuGame(jogo(icones));

    expect(participants.map((p) => p.profileIconId)).toEqual(icones);
  });

  it('sem ícone na origem, fica null em vez de inventar um', () => {
    const { participants } = mapLcuGame(jogo([]));

    expect(participants.every((p) => p.profileIconId === null)).toBe(true);
  });
});
