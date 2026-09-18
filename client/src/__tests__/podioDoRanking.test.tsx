import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PodioDoRanking } from '../components/PodioDoRanking';
import type { LeaderboardEntry } from '../types';

const entrada = (name: string, wins: number): LeaderboardEntry => ({
  playerId: name.toLowerCase(),
  name,
  photoUrl: null,
  games: wins + 2,
  wins,
  losses: 2,
  winRate: 80,
  points: wins * 3,
  avgKda: 4.2,
  totalKills: 10,
  totalDeaths: 5,
  totalAssists: 20,
  avgDamagePerMinute: 300,
  avgVisionScore: 20,
  avgCsPerMinute: 5,
  seriesWon: 1,
  wonLastSeries: false,
  topChampions: [],
  mainRole: 'MID',
  isKdaPlayer: false,
});

const renderizar = (entries: LeaderboardEntry[]) =>
  render(
    <MemoryRouter>
      <PodioDoRanking
        entries={entries}
        rotuloDaMetrica="Vitórias"
        valorDaMetrica={(entry) => String(entry.wins)}
      />
    </MemoryRouter>
  );

const tres = [entrada('Ana', 10), entrada('Bia', 8), entrada('Caio', 6)];

describe('Pódio do ranking', () => {
  it('põe o segundo à esquerda, o primeiro no meio e o terceiro à direita', () => {
    renderizar(tres);
    const nomes = screen.getAllByRole('link').map((link) => link.textContent);
    expect(nomes).toEqual(['Bia', 'Ana', 'Caio']);
  });

  it('mostra o número da métrica escolhida, com o rótulo do lado', () => {
    renderizar(tres);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getAllByText('Vitórias')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/jogadores/ana');
  });

  it('com menos de três colocados não existe pódio', () => {
    const { container } = renderizar(tres.slice(0, 2));
    expect(container).toBeEmptyDOMElement();
  });
});
