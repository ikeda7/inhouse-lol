import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';

/**
 * Telas de conta (issue #3).
 *
 * O que se verifica aqui e que elas MONTAM e mostram o estado certo para um
 * visitante deslogado -- rota respondendo 200 no Vite so prova que o
 * index.html do SPA carregou, nao que o React renderizou a pagina.
 *
 * O `fetch` e dublado porque em jsdom nao existe servidor: `/auth/me`
 * respondendo 401 e exatamente o caso do visitante, que e o estado inicial de
 * quem cai nessas duas telas.
 */

function responder(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: string) => {
      if (entrada.includes('/auth/me')) {
        return responder(401, {
          success: false,
          error: 'Nao autenticado.',
          code: 'NOT_AUTHENTICATED',
        });
      }
      if (entrada.includes('/auth/claimable')) {
        return responder(200, {
          success: true,
          data: [
            {
              id: 'p1',
              name: 'Ikeda',
              riotId: null,
              roles: ['FILL'],
              internalRating: 1000,
              active: true,
              email: null,
              photoUrl: null,
              photoSource: 'NONE',
            },
          ],
        });
      }
      return responder(404, { success: false, error: 'Rota nao encontrada.' });
    })
  );
});

function montar(pagina: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AuthProvider>{pagina}</AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('monta com os campos de e-mail e senha', async () => {
    montar(<LoginPage />);

    expect(await screen.findByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });
});

describe('RegisterPage', () => {
  it('oferece quem ainda nao tem conta para reivindicar', async () => {
    montar(<RegisterPage />);

    // O Select so monta a lista quando abre -- ate la mostra o placeholder.
    const escolha = await screen.findByRole('combobox', { name: /escolha o seu jogador/i });
    await userEvent.click(escolha);

    // O nome vem do /auth/claimable: e o passo "quem e voce".
    expect(await screen.findByRole('option', { name: /Ikeda/ })).toBeInTheDocument();
  });

  it('so libera o cadastro depois de escolher um jogador', async () => {
    montar(<RegisterPage />);

    await screen.findByRole('combobox', { name: /escolha o seu jogador/i });

    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
  });
});
