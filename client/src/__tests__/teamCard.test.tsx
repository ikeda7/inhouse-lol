import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamCard } from '../components/TeamCard';
import type { BalancedTeam, HistoricoNoSorteio } from '../types';

/**
 * O card do time no sorteio automático. Depois que o sorteio passou a
 * equilibrar pelo histórico, o card é onde o grupo confere se ficou parelho:
 * a média do time tem que ser só de quem já jogou, e o novato tem que aparecer
 * como novo, não como KDA 0.
 */

const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

function time(): BalancedTeam {
  const players = ROLES.map((role, i) => ({
    player: {
      id: 'p' + i,
      name: 'Jogador ' + i,
      riotId: null,
      roles: [role],
      internalRating: 1000,
      active: true,
      hasAccount: false,
      photoUrl: null,
      photoSource: 'NONE' as const,
    },
    role,
    side: 'BLUE' as const,
    preferenceIndex: 0,
    isAutofill: false,
    comfortCost: 0,
  }));
  return {
    side: 'BLUE',
    slots: {} as BalancedTeam['slots'],
    players,
    totalRating: 5000,
    averageRating: 1000,
    comfortCost: 0,
  };
}

const HISTORICO: Record<string, HistoricoNoSorteio> = {
  // KDA cru 100: o card mostra o considerado (4.00), não 100.
  p0: { jogos: 4, kda: 100, winRate: 100, kdaConsiderado: 4, winRateConsiderado: 80 },
  p1: { jogos: 6, kda: 2, winRate: 0, kdaConsiderado: 2, winRateConsiderado: 20 },
  p2: { jogos: 0, kda: 0, winRate: 0, kdaConsiderado: 3, winRateConsiderado: 50 },
  p3: { jogos: 0, kda: 0, winRate: 0, kdaConsiderado: 3, winRateConsiderado: 50 },
  p4: { jogos: 0, kda: 0, winRate: 0, kdaConsiderado: 3, winRateConsiderado: 50 },
};

describe('TeamCard', () => {
  it('a média do time é do que o sorteio considerou, não do KDA cru', () => {
    render(<TeamCard team={time()} historico={HISTORICO} />);

    expect(screen.getByText(/KDA 3\.00 · 50%\s*vitórias/)).toBeInTheDocument();
  });

  it('cada linha mostra o KDA da pessoa, e quem não jogou aparece como novo', () => {
    render(<TeamCard team={time()} historico={HISTORICO} />);

    expect(screen.getByText('KDA 100.00')).toBeInTheDocument();
    expect(screen.getAllByText('novo')).toHaveLength(3);
  });

  it('sem histórico (times dos capitães), o card não mostra número nenhum', () => {
    render(<TeamCard team={time()} />);

    expect(screen.queryByText(/KDA/)).not.toBeInTheDocument();
    expect(screen.queryByText('novo')).not.toBeInTheDocument();
  });
});
