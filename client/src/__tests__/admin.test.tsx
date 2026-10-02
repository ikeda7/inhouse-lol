import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { UsarTimesNaSerie } from '../components/UsarTimesNaSerie';
import { LoginPage } from '../pages/LoginPage';
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
        // Em produção os dois andam juntos: com admin nomeado, quem não é ele
        // não administra e o cadastro de contas fica fechado.
        return responder(200, {
          success: true,
          data: { podeAdministrar, cadastroAberto: podeAdministrar },
        });
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

    expect(await screen.findByText(/Quem abre a MD3 é o admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir nova MD3/ })).not.toBeInTheDocument();
  });

  it('o admin abre', async () => {
    montar(<SeriesPage />, true);

    expect(await screen.findByRole('button', { name: /Abrir nova MD3/ })).toBeInTheDocument();
  });
});

describe('levar os times para a série', () => {
  it('quem não é admin vê o aviso no lugar do botão', async () => {
    montar(<UsarTimesNaSerie salvar={() => {}} />, false);

    expect(await screen.findByText(/abre a MD3 é o admin do grupo/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('o admin tem o botão', async () => {
    montar(<UsarTimesNaSerie salvar={() => {}} />, true);

    expect(
      await screen.findByRole('button', { name: /Usar esses times na série/ })
    ).toBeInTheDocument();
  });
});

describe('criar conta', () => {
  it('com o cadastro fechado, Entrar não oferece criar conta', async () => {
    montar(<LoginPage />, false);

    expect(await screen.findByText(/Não precisa de conta para ver o site/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Criar a sua/ })).not.toBeInTheDocument();
  });

  it('com o cadastro aberto, oferece', async () => {
    montar(<LoginPage />, true);

    expect(await screen.findByRole('link', { name: /Criar a sua/ })).toBeInTheDocument();
  });
});
