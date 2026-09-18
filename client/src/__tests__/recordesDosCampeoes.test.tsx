import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecordesDosCampeoes } from '../components/RecordesDosCampeoes';
import type { RecordeDoCampeao } from '../types';

const recorde = (overrides: Partial<RecordeDoCampeao> = {}): RecordeDoCampeao => ({
  categoria: 'maisBanido',
  championName: 'Zed',
  championId: 238,
  championIcon: 'Zed',
  valor: 9,
  exibicao: '9',
  detalhe: '2 jogos · 1V–1D · 9 bans',
  ...overrides,
});

describe('Recordes de campeão', () => {
  it('o recorde é do campeão: mostra o nome dele e de onde o número saiu', () => {
    render(<RecordesDosCampeoes recordes={[recorde()]} />);

    // O nome aparece duas vezes de propósito: no ícone (para leitor de tela) e
    // no texto do cartão.
    expect(screen.getAllByText('Zed').length).toBeGreaterThan(0);
    expect(screen.getByText('Mais banido')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('2 jogos · 1V–1D · 9 bans')).toBeInTheDocument();
    // Nada de jogador aqui: quem joga de quê é assunto do perfil.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('categoria desconhecida não quebra a tela, só não aparece', () => {
    render(<RecordesDosCampeoes recordes={[recorde({ categoria: 'inventada' }), recorde()]} />);
    // Um cartão só: o da categoria conhecida.
    expect(screen.getAllByText('Mais banido')).toHaveLength(1);
    expect(screen.getAllByText('2 jogos · 1V–1D · 9 bans')).toHaveLength(1);
  });

  it('sem recordes, explica em vez de mostrar uma grade vazia', () => {
    render(<RecordesDosCampeoes recordes={[]} />);
    expect(screen.getByText(/Nenhum campeão escolhido ou banido/)).toBeInTheDocument();
  });
});
