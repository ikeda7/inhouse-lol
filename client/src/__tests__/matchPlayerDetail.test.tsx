import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { calcularMaximos, MatchPlayerDetail } from '../components/MatchPlayerDetail';
import type { MatchStat } from '../types';

/**
 * O detalhe do jogador: cada número grande vem com uma barra do tamanho
 * relativo ao MELHOR DA PARTIDA -- um número só significa algo ao lado de um
 * máximo (regra do CLAUDE.md). O que quebra calado aqui é a conta da barra:
 * relativa à coisa errada, ou estourando quando a partida não tem o dado.
 */

function linha(mudanca: Partial<MatchStat> = {}): MatchStat {
  return {
    id: 's1',
    playerId: 'p1',
    teamSide: 'BLUE',
    rolePlayed: 'MID',
    championName: 'Ahri',
    championId: null,
    kills: 5,
    deaths: 2,
    assists: 7,
    damage: 15000,
    damageTaken: 12000,
    goldEarned: 11000,
    visionScore: 20,
    cs: 180,
    win: true,
    doubleKills: 0,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 0,
    largestMultiKill: 0,
    firstBloodKill: false,
    firstBloodAssist: false,
    killingSprees: 0,
    largestCriticalStrike: 0,
    champLevel: 16,
    goldSpent: 10000,
    totalDamageDealt: 90000,
    damageToObjectives: 3000,
    damageToTurrets: 2000,
    damageSelfMitigated: 8000,
    totalHeal: 1500,
    physicalDamageToChampions: 0,
    magicDamageToChampions: 0,
    trueDamageToChampions: 0,
    timeCCingOthers: 10,
    longestTimeSpentLiving: 400,
    turretKills: 1,
    inhibitorKills: 0,
    wardsPlaced: 8,
    wardsKilled: 2,
    controlWardsBought: 1,
    laneMinionsKilled: 160,
    neutralMinionsKilled: 20,
    items: null,
    spell1Id: null,
    spell2Id: null,
    keystoneId: null,
    primaryStyleId: null,
    subStyleId: null,
    player: { id: 'p1', name: 'Ana' },
    ...mudanca,
  };
}

function montar(stat: MatchStat, outros: MatchStat[], gameDurationSec: number | null = 1800) {
  render(
    <MatchPlayerDetail
      stat={stat}
      gameDurationSec={gameDurationSec}
      maximos={calcularMaximos([stat, ...outros])}
    />
  );
}

/** Largura da barra de uma métrica: o único elemento com `style` dentro dela. */
function barra(rotulo: string): string | null {
  const metrica = screen.getByText(rotulo).closest('div');
  const preenchimento = metrica?.querySelector<HTMLElement>('[style]');
  return preenchimento ? preenchimento.style.width : null;
}

describe('MatchPlayerDetail', () => {
  it('a barra é relativa ao melhor da partida, não ao próprio número', () => {
    montar(linha({ damage: 15000 }), [linha({ id: 's2', playerId: 'p2', damage: 30000 })]);

    expect(barra('a campeões')).toBe('50%');
  });

  it('o melhor da partida enche a barra', () => {
    montar(linha({ damage: 30000 }), [linha({ id: 's2', playerId: 'p2', damage: 12000 })]);

    expect(barra('a campeões')).toBe('100%');
  });

  it('partida sem o dado não estoura nem vira NaN: a barra fica vazia', () => {
    montar(linha({ damage: 0 }), [linha({ id: 's2', playerId: 'p2', damage: 0 })]);

    expect(barra('a campeões')).toBe('0%');
  });

  it('métrica sem comparação não desenha barra', () => {
    montar(linha(), []);

    expect(barra('a objetivos')).toBeNull();
  });

  it('sem a duração do jogo, o por-minuto vira "--" em vez de um número inventado', () => {
    montar(linha(), [], null);

    // Dano, ouro e farm viram "--/min" juntos; o de dano é o que se procura.
    expect(screen.getByText('a campeões').closest('div')).toHaveTextContent('--/min');
    expect(document.body).not.toHaveTextContent('NaN');
  });

  it('quebra o dano em físico, mágico e verdadeiro, sem a parte zerada', () => {
    montar(
      linha({
        physicalDamageToChampions: 6000,
        magicDamageToChampions: 4000,
        trueDamageToChampions: 0,
      }),
      []
    );

    expect(screen.getByText('físico 60%')).toBeInTheDocument();
    expect(screen.getByText('mágico 40%')).toBeInTheDocument();
    expect(screen.queryByText(/verdadeiro/)).not.toBeInTheDocument();
  });
});
