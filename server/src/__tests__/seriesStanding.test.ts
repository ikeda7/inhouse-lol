import { describe, it, expect } from 'vitest';
import { computeSeriesStanding } from '../services/series.js';

/**
 * Regressao de um bug REAL: na MD3 de 07/09/2026 os mesmos 5 jogadores
 * venceram os dois jogos, mas trocaram de lado entre eles. Contando por
 * BLUE/RED, o 2-0 virava 1-1 -- a serie nunca fechava e ninguem levava o
 * bonus de +1 ponto.
 */

const TIME_A = ['vini', 'bruno', 'denyon', 'leo', 'ikeda'];
const TIME_B = ['lara', 'crepaldi', 'igor', 'kaio', 'marcos'];

/** Monta um jogo dizendo quem estava de azul e quem venceu. */
function jogo(matchNumber: number, azul: string[], vermelho: string[], winner: 'BLUE' | 'RED') {
  return {
    matchNumber,
    winner,
    stats: [
      ...azul.map((playerId) => ({ playerId, teamSide: 'BLUE' })),
      ...vermelho.map((playerId) => ({ playerId, teamSide: 'RED' })),
    ],
  };
}

describe('computeSeriesStanding', () => {
  it('conta 2-0 quando o mesmo elenco vence os dois jogos SEM trocar de lado', () => {
    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      jogo(2, TIME_A, TIME_B, 'BLUE'),
    ]);

    expect(standing.teamAWins).toBe(2);
    expect(standing.teamBWins).toBe(0);
  });

  it('conta 2-0 mesmo quando os times TROCAM DE LADO entre os jogos', () => {
    // Este e o caso que estava quebrado: jogo 1 vence de azul, jogo 2 vence de
    // vermelho. Por cor daria 1-1; por elenco e 2-0.
    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      jogo(2, TIME_B, TIME_A, 'RED'),
    ]);

    expect(standing.teamAWins).toBe(2);
    expect(standing.teamBWins).toBe(0);
    expect(standing.rostersUnstable).toBe(false);
  });

  it('conta 2-1 numa MD3 disputada com troca de lados', () => {
    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'), // A vence
      jogo(2, TIME_B, TIME_A, 'BLUE'), // B vence
      jogo(3, TIME_A, TIME_B, 'BLUE'), // A vence
    ]);

    expect(standing.teamAWins).toBe(2);
    expect(standing.teamBWins).toBe(1);
  });

  it('identifica o time mesmo com uma substituicao (maioria de 5)', () => {
    // Alguem cai e entra um reserva: 4 dos 5 continuam, ainda e o mesmo time.
    const comReserva = [...TIME_A.slice(0, 4), 'reserva'];

    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      jogo(2, TIME_B, comReserva, 'RED'),
    ]);

    expect(standing.teamAWins).toBe(2);
    expect(standing.rostersUnstable).toBe(false);
  });

  it('decide pela maioria quando o elenco foi re-sorteado no meio da MD3', () => {
    // 2 do time A + 3 do time B vencem juntos. A maioria manda: conta para B.
    const misturado = [...TIME_A.slice(0, 2), ...TIME_B.slice(0, 3)];
    const oResto = [...TIME_A.slice(2), ...TIME_B.slice(3)];

    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      jogo(2, misturado, oResto, 'BLUE'),
    ]);

    expect(standing.teamAWins).toBe(1);
    expect(standing.teamBWins).toBe(1);
    // Com 5 vencedores sempre ha maioria, entao nao ha ambiguidade real aqui.
    expect(standing.rostersUnstable).toBe(false);
  });

  it('so marca instavel quando o jogo vem com elenco incompleto', () => {
    // Com 5 vencedores um lado SEMPRE atinge a maioria de 3 -- entao o unico
    // jeito de haver empate e o dado chegar quebrado (partida sem os 5).
    // O guard existe para esse caso: nao trava, marca e segue.
    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      {
        matchNumber: 2,
        winner: 'BLUE',
        stats: [
          { playerId: 'vini', teamSide: 'BLUE' },
          { playerId: 'bruno', teamSide: 'BLUE' },
          { playerId: 'lara', teamSide: 'BLUE' },
          { playerId: 'crepaldi', teamSide: 'BLUE' },
        ],
      },
    ]);

    expect(standing.rostersUnstable).toBe(true);
    expect(standing.teamAWins + standing.teamBWins).toBe(2);
  });

  it('ignora jogo ainda sem vencedor', () => {
    const standing = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      { matchNumber: 2, winner: null, stats: [] },
    ]);

    expect(standing.teamAWins).toBe(1);
    expect(standing.teamBWins).toBe(0);
  });

  it('devolve zerado quando a serie ainda nao tem jogos', () => {
    expect(computeSeriesStanding([])).toEqual({
      teamAWins: 0,
      teamBWins: 0,
      rostersUnstable: false,
    });
  });

  it('nao depende da ordem em que os jogos chegam', () => {
    const emOrdem = computeSeriesStanding([
      jogo(1, TIME_A, TIME_B, 'BLUE'),
      jogo(2, TIME_B, TIME_A, 'RED'),
    ]);
    const invertido = computeSeriesStanding([
      jogo(2, TIME_B, TIME_A, 'RED'),
      jogo(1, TIME_A, TIME_B, 'BLUE'),
    ]);

    // O jogo 1 e a ancora; a ordem de chegada nao pode mudar isso.
    expect(invertido).toEqual(emOrdem);
  });
});
