import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  ...overrides,
});

describe('Tabela de campeões', () => {
  it('mostra presença, jogos, bans e aproveitamento de cada campeão', () => {
    render(<TabelaDeCampeoes campeoes={[campeao()]} partidas={10} />);

    const linha = screen.getByRole('row', { name: /Lux/ });
    expect(within(linha).getByText('60%')).toBeInTheDocument();
    expect(within(linha).getByText('75%')).toBeInTheDocument();
    // O denominador precisa estar na tela: 60% de quê, se não?
    expect(screen.getByText(/sobre 10 partidas/)).toBeInTheDocument();
  });

  it('campeão só banido mostra traço, não 0% — que seria "jogou e perdeu tudo"', () => {
    render(
      <TabelaDeCampeoes
        campeoes={[campeao({ championName: 'Zed', partidas: 0, vitorias: 0, winRate: null })]}
        partidas={10}
      />
    );
    const linha = screen.getByRole('row', { name: /Zed/ });
    expect(within(linha).getByText('—')).toBeInTheDocument();
    expect(within(linha).queryByText('0%')).not.toBeInTheDocument();
  });

  it('sem campeão nenhum, explica em vez de mostrar uma tabela vazia', () => {
    render(<TabelaDeCampeoes campeoes={[]} partidas={0} />);
    expect(screen.getByText(/Nenhum campeão escolhido ou banido/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
