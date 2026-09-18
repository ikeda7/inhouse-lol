import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TabelaDeCampeoes } from '../components/TabelaDeCampeoes';
import type { EstatisticaDeCampeao } from '../types';

const campeao = (overrides: Partial<EstatisticaDeCampeao> = {}): EstatisticaDeCampeao => ({
  championName: 'Lux',
  championId: 99,
  championIcon: 'Lux',
  partidas: 4,
  vitorias: 3,
  bans: 2,
  pickRate: 40,
  banRate: 20,
  presenca: 60,
  winRate: 75,
  kda: 4.5,
  danoPorMinuto: 780,
  quemMaisJoga: { playerId: 'p1', name: 'Ana', jogos: 3 },
  ...overrides,
});

const renderizar = (campeoes: EstatisticaDeCampeao[], partidas = 10) =>
  render(
    <MemoryRouter>
      <TabelaDeCampeoes campeoes={campeoes} partidas={partidas} />
    </MemoryRouter>
  );

describe('Tabela de campeões', () => {
  it('mostra presença, placar, KDA, dano e quem mais joga', () => {
    renderizar([campeao()]);

    const linha = screen.getByRole('row', { name: /Lux/ });
    expect(within(linha).getByText('60%')).toBeInTheDocument();
    expect(within(linha).getByText('3–1')).toBeInTheDocument();
    expect(within(linha).getByText('75%')).toBeInTheDocument();
    expect(within(linha).getByText('4.50')).toBeInTheDocument();
    expect(within(linha).getByText('780')).toBeInTheDocument();
    expect(within(linha).getByRole('link', { name: 'Ana' })).toHaveAttribute(
      'href',
      '/jogadores/p1'
    );
    // O denominador precisa estar na tela: 60% de quê, se não?
    expect(screen.getByText(/sobre 10 partidas/)).toBeInTheDocument();
  });

  it('campeão só banido mostra traço, não 0% — que seria "jogou e perdeu tudo"', () => {
    renderizar([
      campeao({
        championName: 'Zed',
        partidas: 0,
        vitorias: 0,
        winRate: null,
        kda: null,
        danoPorMinuto: null,
        quemMaisJoga: null,
      }),
    ]);
    // Cinco colunas viram traço: V–D, vitórias, KDA, dano e quem mais joga.
    const linha = screen.getByRole('row', { name: /Zed/ });
    expect(within(linha).getAllByText('—')).toHaveLength(5);
    expect(within(linha).queryByText('0%')).not.toBeInTheDocument();
  });

  it('sem campeão nenhum, explica em vez de mostrar uma tabela vazia', () => {
    renderizar([], 0);
    expect(screen.getByText(/Nenhum campeão escolhido ou banido/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
