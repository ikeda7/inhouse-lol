import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { PlayersPage } from '../pages/PlayersPage';
import { SeriesPage } from '../pages/SeriesPage';

/**
 * Controles de admin: quem não administra não vê o que o servidor recusaria.
 *
 * A trava de verdade é do servidor (`exigirAdmin`); aqui se confere só que a
 * tela acompanha a resposta de `/auth/permissoes` -- some para quem não pode,
 * e continua inteira para quem pode (inclusive quando não há admin
 * configurado, que é como o CI e um clone novo rodam).
 */

function responder(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const JOGADOR = {
  id: 'p1',
  name: 'Ikeda',
  riotId: 'Ikeda#BR1',
  riotAccounts: [],
  roles: ['SUPPORT'],
  internalRating: 1000,
  active: true,
  hasAccount: true,
  photoUrl: null,
  photoSource: 'NONE',
};

function montar(pagina: React.ReactNode, podeAdministrar: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: string) => {
      if (entrada.includes('/auth/permissoes')) {
        return responder(200, { success: true, data: { podeAdministrar } });
      }
      if (entrada.includes('/auth/me')) {
        return responder(401, { success: false, error: 'Não autenticado.' });
      }
      if (entrada.includes('/players')) return responder(200, { success: true, data: [JOGADOR] });
      if (entrada.includes('/series/current')) return responder(200, { success: true, data: null });
      return responder(404, { success: false, error: 'Rota não encontrada.' });
    })
  );

  return render(
    <MemoryRouter>
      <AuthProvider>{pagina}</AuthProvider>
    </MemoryRouter>
  );
}

describe('Jogadores', () => {
  it('quem não é admin vê a lista, sem cadastro e sem os botões da linha', async () => {
    montar(<PlayersPage />, false);

    expect(await screen.findByRole('link', { name: 'Ikeda' })).toBeInTheDocument();
    expect(await screen.findByText(/é o admin do grupo/)).toBeInTheDocument();
    expect(screen.queryByText('Novo jogador')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Ikeda' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar Ikeda' })).not.toBeInTheDocument();
  });

  it('o admin cadastra, edita e desativa', async () => {
    montar(<PlayersPage />, true);

    expect(await screen.findByText('Novo jogador')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Editar Ikeda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Ikeda' })).toBeInTheDocument();
  });
});

describe('Série', () => {
  it('quem não é admin não abre MD3 na mão', async () => {
    montar(<SeriesPage />, false);

    expect(await screen.findByText(/Usar esses times na série/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir nova MD3/ })).not.toBeInTheDocument();
  });

  it('o admin abre', async () => {
    montar(<SeriesPage />, true);

    expect(await screen.findByRole('button', { name: /Abrir nova MD3/ })).toBeInTheDocument();
  });
});
