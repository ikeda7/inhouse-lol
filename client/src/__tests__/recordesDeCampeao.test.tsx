import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecordesDeCampeao } from '../components/RecordesDeCampeao';
import type { RecordeDeCampeao } from '../types';

const recorde = (overrides: Partial<RecordeDeCampeao> = {}): RecordeDeCampeao => ({
  categoria: 'campeaoWinrate',
  playerId: 'p1',
  playerName: 'Ana',
  championName: 'Lux',
  championId: 99,
  championIcon: 'Lux',
  jogos: 4,
  vitorias: 3,
  valor: 75,
  exibicao: '75%',
  ...overrides,
});

const renderizar = (recordes: RecordeDeCampeao[]) =>
  render(
    <MemoryRouter>
      <RecordesDeCampeao recordes={recordes} />
    </MemoryRouter>
  );

describe('Recordes de campeão', () => {
  it('mostra o campeão, o placar e leva ao perfil de quem fez', () => {
    renderizar([recorde()]);

    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/jogadores/p1');
    expect(screen.getByText('75%')).toBeInTheDocument();
    // O número sozinho não diz de quantos jogos saiu.
    expect(screen.getByText(/Lux · 3V–1D/)).toBeInTheDocument();
  });

  it('categoria desconhecida não quebra a tela, só não aparece', () => {
    renderizar([recorde({ categoria: 'inventada' }), recorde()]);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('sem recordes, explica em vez de mostrar uma grade vazia', () => {
    renderizar([]);
    expect(screen.getByText(/Ainda não deu para eleger/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
