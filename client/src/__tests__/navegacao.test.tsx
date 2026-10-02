import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { HistoryPage } from '../pages/HistoryPage';
import { SeriesPage } from '../pages/SeriesPage';
import { linkDaSerie } from '../lib/links';

/**
 * Onde as telas levam.
 *
 * Um jogo aparece no perfil, nos recordes e nos momentos, e todos apontam para
 * o mesmo endereço: a série aberta no Histórico, com o jogo em foco. Aqui se
 * confere as duas pontas -- o endereço que os links montam e o que o Histórico
 * faz ao recebê-lo -- e que a aba Série não é mais um beco sem MD3.
 */

function responder(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const jogo = (matchNumber: number) => ({
  id: `m${matchNumber}`,
  matchNumber,
  winner: 'BLUE',
  gameDurationSec: 1800,
  playedAt: '2026-10-02T01:00:00.000Z',
  source: 'LCU',
  gameVersion: null,
  surrendered: false,
  stats: [],
  teams: [],
  bans: [],
});

const SERIE = {
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
  matches: [
    { id: 'm1', matchNumber: 1, winner: 'BLUE', gameDurationSec: 1800 },
    { id: 'm2', matchNumber: 2, winner: 'RED', gameDurationSec: 1860 },
  ],
  elencos: {
    a: [
      { id: 'p1', name: 'Cardoso' },
      { id: 'p2', name: 'Ikeda' },
    ],
    b: [
      { id: 'p3', name: 'Rafael' },
      { id: 'p4', name: 'Lara' },
    ],
  },
};

const DETALHE = { ...SERIE, matches: [jogo(1), jogo(2)], burnedChampions: [] };

function montar(pagina: React.ReactNode, endereco: string, { comMd3 = false } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: string) => {
      if (entrada.includes('/auth/permissoes')) {
        return responder(200, {
          success: true,
          data: { podeAdministrar: false, cadastroAberto: false },
        });
      }
      if (entrada.includes('/auth/me')) return responder(401, { success: false, error: 'x' });
      if (entrada.includes('/series/current')) {
        return responder(200, { success: true, data: comMd3 ? DETALHE : null });
      }
      if (entrada.includes('/series/s1')) return responder(200, { success: true, data: DETALHE });
      if (entrada.includes('/series?')) return responder(200, { success: true, data: [SERIE] });
      if (entrada.includes('/players')) return responder(200, { success: true, data: [] });
      return responder(404, { success: false, error: 'Rota não encontrada.' });
    })
  );

  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <AuthProvider>{pagina}</AuthProvider>
    </MemoryRouter>
  );
}

describe('linkDaSerie', () => {
  it('aponta para a série no Histórico, com ou sem o jogo', () => {
    expect(linkDaSerie('s1')).toBe('/historico?serie=s1');
    expect(linkDaSerie('s1', 2)).toBe('/historico?serie=s1&jogo=2');
  });
});

describe('Histórico', () => {
  it('a lista diz quem jogou contra quem e quem venceu', async () => {
    montar(<HistoryPage />, '/historico');

    const linha = (await screen.findByText('Quinta 01/10')).closest('button') as HTMLElement;
    expect(within(linha).getByText('Cardoso · Ikeda')).toBeInTheDocument();
    expect(within(linha).getByText('Rafael · Lara')).toBeInTheDocument();
    // O selo fica na linha do time A, que fez 2 a 0.
    const selo = within(linha).getByText('venceu');
    expect(selo.parentElement).toHaveTextContent('Cardoso · Ikeda');
    expect(within(linha).getByText(/2 jogos · 61 min de jogo · Fearless/)).toBeInTheDocument();
    // Fechada: nenhum jogo na tela ainda.
    expect(linha).toHaveAttribute('aria-expanded', 'false');
  });

  it('o endereço abre a série e põe o jogo pedido em foco', async () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;

    montar(<HistoryPage />, linkDaSerie('s1', 2));

    const jogo2 = (await screen.findByRole('heading', { name: 'Jogo 2' })).closest(
      '[data-jogo]'
    ) as HTMLElement;
    const jogo1 = screen.getByRole('heading', { name: 'Jogo 1' }).closest('[data-jogo]');

    expect(screen.getByText('Quinta 01/10').closest('button')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(jogo2).toHaveAttribute('data-jogo', '2');
    // Só o jogo pedido leva o fio dourado, e é para ele que a tela rola.
    expect(jogo2.className).toContain('border-gold');
    expect(jogo1?.className).not.toContain('border-gold');
    expect(rolar.mock.contexts.at(-1)).toBe(jogo2);
  });
});

describe('Histórico no celular', () => {
  const telaDe = (estreita: boolean) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: estreita }))
    );
  const botaoDoJogo = (numero: number) => screen.getByRole('button', { name: `Jogo ${numero}` });

  it('os jogos abrem recolhidos, menos o que o link pediu', async () => {
    telaDe(true);
    montar(<HistoryPage />, linkDaSerie('s1', 2));

    await screen.findByRole('heading', { name: 'Jogo 2' });
    expect(botaoDoJogo(2)).toHaveAttribute('aria-expanded', 'true');
    expect(botaoDoJogo(1)).toHaveAttribute('aria-expanded', 'false');
  });

  it('tocar no jogo abre e fecha', async () => {
    telaDe(true);
    const usuario = userEvent.setup();
    montar(<HistoryPage />, linkDaSerie('s1'));

    await screen.findByRole('heading', { name: 'Jogo 1' });
    expect(botaoDoJogo(1)).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(botaoDoJogo(1));
    expect(botaoDoJogo(1)).toHaveAttribute('aria-expanded', 'true');
    // Só com o jogo aberto aparece a imagem dele para baixar.
    expect(screen.getAllByRole('button', { name: /Baixar/ }).length).toBeGreaterThan(0);

    await usuario.click(botaoDoJogo(1));
    expect(botaoDoJogo(1)).toHaveAttribute('aria-expanded', 'false');
  });

  it('no desktop tudo continua aberto', async () => {
    telaDe(false);
    montar(<HistoryPage />, linkDaSerie('s1'));

    await screen.findByRole('heading', { name: 'Jogo 1' });
    expect(botaoDoJogo(1)).toHaveAttribute('aria-expanded', 'true');
    expect(botaoDoJogo(2)).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Série sem MD3', () => {
  it('mostra a última noite, com o caminho para os jogos', async () => {
    montar(<SeriesPage />, '/serie');

    expect(await screen.findByRole('heading', { name: 'Última noite' })).toBeInTheDocument();
    expect(screen.getByText('Quinta 01/10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver os jogos/ })).toHaveAttribute(
      'href',
      '/historico?serie=s1'
    );
    expect(screen.getByText(/Nenhuma MD3 em andamento/)).toBeInTheDocument();
  });

  it('com MD3 em andamento a última noite sai de cena', async () => {
    montar(<SeriesPage />, '/serie', { comMd3: true });

    expect(await screen.findByText(/Nenhum jogo registrado|Jogos da série/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Última noite' })).not.toBeInTheDocument();
  });
});
