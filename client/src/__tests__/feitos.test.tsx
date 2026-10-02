import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Feitos } from '../components/Feitos';
import { FaixaDaNoite } from '../components/FaixaDaNoite';

/**
 * Os feitos de um jogador no perfil e a faixa da noite no ranking: dois lugares
 * novos que contam o que aconteceu e levam ao jogo.
 */

function responder(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const contexto = (mudanca: Record<string, unknown> = {}) => ({
  playerId: 'p1',
  playerName: 'Léo',
  championName: 'Caitlyn',
  ddragonId: 'Caitlyn',
  rolePlayed: 'ADC',
  teamSide: 'BLUE',
  matchId: 'm1',
  matchNumber: 1,
  seriesId: 's1',
  seriesName: 'Segunda 07/09',
  playedAt: '2026-09-07T23:00:00.000Z',
  kills: 18,
  deaths: 4,
  assists: 11,
  win: true,
  ...mudanca,
});

const DESTAQUES = {
  partidas: 10,
  recordes: [
    { ...contexto(), categoria: 'kills', valor: 18, exibicao: '18' },
    {
      ...contexto({ playerId: 'p2', playerName: 'Bruno' }),
      categoria: 'kda',
      valor: 34,
      exibicao: '34.00',
    },
  ],
  momentos: [
    // Dois LEGENDARY (sequência de 10+) em noites diferentes, e um GODLIKE.
    { ...contexto(), tipo: 'SPREE', valor: 10, peso: 80 },
    {
      ...contexto({ seriesId: 's2', seriesName: 'Quinta 17/09', matchNumber: 2 }),
      playedAt: '2026-09-17T23:00:00.000Z',
      tipo: 'SPREE',
      valor: 13,
      peso: 80,
    },
    { ...contexto(), tipo: 'CARRY', valor: 41000, peso: 40 },
    { ...contexto({ playerId: 'p2' }), tipo: 'PENTA', valor: 5, peso: 100 },
  ],
};

function montar(componente: React.ReactNode, rotas: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: string) => {
      const rota = Object.keys(rotas).find((caminho) => entrada.includes(caminho));
      return rota
        ? responder(200, { success: true, data: rotas[rota] })
        : responder(404, { success: false, error: 'Rota não encontrada.' });
    })
  );
  return render(<MemoryRouter>{componente}</MemoryRouter>);
}

describe('Feitos', () => {
  it('mostra só os recordes do jogador, cada um levando ao jogo', async () => {
    montar(<Feitos playerId="p1" />, { '/stats/highlights': DESTAQUES });

    const recorde = await screen.findByRole('link', { name: /Mais abates: 18/ });
    expect(recorde).toHaveAttribute('href', '/historico?serie=s1&jogo=1');
    // O recorde do Bruno não é dele.
    expect(screen.queryByRole('link', { name: /Melhor KDA/ })).not.toBeInTheDocument();
  });

  it('conta os momentos pelo nome que o jogo grita, e leva ao mais recente', async () => {
    montar(<Feitos playerId="p1" />, { '/stats/highlights': DESTAQUES });

    const legendary = await screen.findByRole('link', { name: /LEGENDARY, 2 vezes/ });
    // Dos dois, o de 17/09 é o mais novo.
    expect(legendary).toHaveAttribute('href', '/historico?serie=s2&jogo=2');
    expect(screen.getByRole('link', { name: /CARREGOU, uma vez/ })).toBeInTheDocument();
    // O pentakill é de outro jogador.
    expect(screen.queryByRole('link', { name: /PENTAKILL/ })).not.toBeInTheDocument();
  });

  it('quem não tem feito nenhum vê a explicação, não um cartão vazio', async () => {
    montar(<Feitos playerId="p9" />, { '/stats/highlights': DESTAQUES });

    expect(await screen.findByText(/Nenhum recorde nem momento ainda/)).toBeInTheDocument();
  });

  it('se a busca falhar, o cartão simplesmente não aparece', async () => {
    const { container } = montar(<Feitos playerId="p1" />, {});

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Faixa da noite', () => {
  const serie = (mudanca: Record<string, unknown> = {}) => ({
    id: 's1',
    name: 'Quinta 01/10',
    date: '2026-10-02T01:00:00.000Z',
    status: 'FINISHED',
    winnerTeam: 'BLUE',
    scoreline: '2-0',
    blueScore: 2,
    redScore: 0,
    fearless: true,
    burnedCount: 20,
    matches: [{ id: 'm1', matchNumber: 1, winner: 'BLUE', gameDurationSec: 1800 }],
    elencos: {
      a: [
        { id: 'p1', name: 'Cardoso' },
        { id: 'p2', name: 'Ikeda' },
      ],
      b: [{ id: 'p3', name: 'Rafael' }],
    },
    ...mudanca,
  });

  it('sem MD3 em andamento, mostra a última noite e leva aos jogos dela', async () => {
    montar(<FaixaDaNoite />, { '/series?': [serie()] });

    const faixa = await screen.findByRole('link', { name: /Última noite/ });
    expect(faixa).toHaveAttribute('href', '/historico?serie=s1');
    expect(faixa).toHaveTextContent('Quinta 01/10');
    expect(faixa).toHaveTextContent('venceram Cardoso, Ikeda');
  });

  it('com MD3 em andamento, ela tem prioridade e leva à Série', async () => {
    montar(<FaixaDaNoite />, {
      '/series?': [
        serie({ id: 's2', name: 'Quinta 08/10', status: 'ONGOING', blueScore: 1, matches: [] }),
        serie(),
      ],
    });

    const faixa = await screen.findByRole('link', { name: /Em andamento/ });
    expect(faixa).toHaveAttribute('href', '/serie');
    expect(faixa).toHaveTextContent('Quinta 08/10');
  });

  it('série aberta por engano, sem jogo e já encerrada, não é "a última noite"', async () => {
    montar(<FaixaDaNoite />, {
      '/series?': [serie({ id: 's0', name: 'Vazia', matches: [], blueScore: 0 }), serie()],
    });

    const faixa = await screen.findByRole('link', { name: /Última noite/ });
    expect(faixa).toHaveTextContent('Quinta 01/10');
  });
});
