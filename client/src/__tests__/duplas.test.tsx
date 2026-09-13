import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Duplas } from '../components/Duplas';
import type { DuplaNoPerfil } from '../types';

const dupla = (
  parceiroId: string,
  name: string,
  vitorias: number,
  jogos: number
): DuplaNoPerfil => ({
  parceiroId,
  name,
  photoUrl: null,
  jogos,
  vitorias,
  winRate: Math.round((vitorias / jogos) * 1000) / 10,
});

const renderizar = (duplas: { melhores: DuplaNoPerfil[]; piores: DuplaNoPerfil[] }) =>
  render(
    <MemoryRouter>
      <Duplas duplas={duplas} />
    </MemoryRouter>
  );

describe('Duplas no perfil', () => {
  it('cada parceiro leva ao perfil dele, com o placar da dupla e o winrate', () => {
    renderizar({ melhores: [dupla('p1', 'Ana', 4, 5)], piores: [dupla('p2', 'Caio', 1, 4)] });

    const ganha = screen.getByRole('region', { name: 'Ganha mais com' });
    expect(within(ganha).getByRole('link', { name: 'Ana' })).toHaveAttribute(
      'href',
      '/jogadores/p1'
    );
    expect(within(ganha).getByText('4–1 juntos')).toBeInTheDocument();
    expect(within(ganha).getByText('80%')).toBeInTheDocument();

    const perde = screen.getByRole('region', { name: 'Perde mais com' });
    expect(within(perde).getByRole('link', { name: 'Caio' })).toBeInTheDocument();
    expect(within(perde).getByText('25%')).toBeInTheDocument();
  });

  it('uma lista vazia diz que ainda não tem ninguém, sem sumir com a outra', () => {
    renderizar({ melhores: [dupla('p1', 'Ana', 3, 3)], piores: [] });
    expect(
      within(screen.getByRole('region', { name: 'Perde mais com' })).getByText('Ninguém ainda.')
    ).toBeInTheDocument();
  });

  it('sem nenhuma dupla, explica a regra em vez de mostrar duas listas vazias', () => {
    renderizar({ melhores: [], piores: [] });
    expect(screen.getByText(/pelo menos 3 partidas no mesmo time/)).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
