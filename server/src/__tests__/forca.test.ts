import { describe, expect, it } from 'vitest';
import { autoBalanceTeams, NEUTRAL_RATING, type DraftablePlayer } from '../lib/autoBalance.js';
import { historicoConsiderado, ratingPorHistorico } from '../lib/forca.js';

/** KDA do grupo inteiro nos testes: a régua da força. */
const GRUPO = 2.5;

describe('ratingPorHistorico', () => {
  it('quem nunca jogou fica exatamente na média', () => {
    expect(ratingPorHistorico(undefined, GRUPO)).toBe(NEUTRAL_RATING);
    expect(ratingPorHistorico({ jogos: 0, vitorias: 0, kda: 0 }, GRUPO)).toBe(NEUTRAL_RATING);
  });

  it('o KDA do grupo com metade das vitórias é a média', () => {
    expect(ratingPorHistorico({ jogos: 6, vitorias: 3, kda: GRUPO }, GRUPO)).toBe(NEUTRAL_RATING);
  });

  it('jogar bem sobe e jogar mal desce', () => {
    expect(ratingPorHistorico({ jogos: 6, vitorias: 5, kda: 5 }, GRUPO)).toBeGreaterThan(
      NEUTRAL_RATING
    );
    expect(ratingPorHistorico({ jogos: 6, vitorias: 1, kda: 1.2 }, GRUPO)).toBeLessThan(
      NEUTRAL_RATING
    );
  });

  it('com os mesmos números, quem jogou pouco fica mais perto da média', () => {
    // Um 2-0 com KDA 10 no primeiro dia não pode virar o mais forte do grupo.
    const doisJogos = ratingPorHistorico({ jogos: 2, vitorias: 2, kda: 10 }, GRUPO);
    const dezJogos = ratingPorHistorico({ jogos: 10, vitorias: 10, kda: 10 }, GRUPO);

    expect(doisJogos).toBeGreaterThan(NEUTRAL_RATING);
    expect(doisJogos).toBeLessThan(dezJogos);
  });

  it('KDA é razão: o dobro da média sobe o mesmo que a metade desce', () => {
    const soKda = { jogosDePeso: 0, pesoVitorias: 0 };
    const dobro = ratingPorHistorico({ jogos: 4, vitorias: 2, kda: GRUPO * 2 }, GRUPO, soKda);
    const metade = ratingPorHistorico({ jogos: 4, vitorias: 2, kda: GRUPO / 2 }, GRUPO, soKda);

    expect(dobro - NEUTRAL_RATING).toBe(NEUTRAL_RATING - metade);
  });

  it('as vitórias pesam: com o mesmo KDA, quem ganha mais fica mais forte', () => {
    const ganha = ratingPorHistorico({ jogos: 6, vitorias: 5, kda: GRUPO }, GRUPO);
    const perde = ratingPorHistorico({ jogos: 6, vitorias: 1, kda: GRUPO }, GRUPO);

    expect(ganha).toBeGreaterThan(perde);
  });

  it('KDA absurdo tem teto: acima de 4x a média, KDA 50 e KDA 90 valem o mesmo', () => {
    const cinquenta = ratingPorHistorico({ jogos: 9, vitorias: 5, kda: 50 }, GRUPO);
    const noventa = ratingPorHistorico({ jogos: 9, vitorias: 5, kda: 90 }, GRUPO);

    expect(noventa).toBe(cinquenta);
    expect(noventa).toBeGreaterThan(NEUTRAL_RATING);
  });

  it('o considerado: novato vale a média do grupo, e KDA absurdo fica no teto', () => {
    expect(historicoConsiderado(undefined, GRUPO)).toEqual({ kda: GRUPO, vitorias: 0.5 });
    expect(historicoConsiderado({ jogos: 9, vitorias: 9, kda: 90 }, GRUPO).kda).toBe(GRUPO * 4);
  });

  it('no sorteio, os dois mais fortes pelo histórico caem em times diferentes', () => {
    // Todo mundo Fill: as roles não atrapalham, só a força decide.
    const historicos = [
      { jogos: 6, vitorias: 6, kda: 6 },
      { jogos: 6, vitorias: 6, kda: 6 },
      ...Array.from({ length: 8 }, () => ({ jogos: 6, vitorias: 3, kda: GRUPO })),
    ];
    const elenco: DraftablePlayer[] = historicos.map((historico, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      roles: ['FILL'],
      rating: ratingPorHistorico(historico, GRUPO),
    }));

    for (const seed of [1, 2, 3]) {
      const azul = autoBalanceTeams(elenco, { seed }).blueTeam.players.map((e) => e.player.id);
      expect(['p0', 'p1'].filter((id) => azul.includes(id))).toHaveLength(1);
    }
  });
});
