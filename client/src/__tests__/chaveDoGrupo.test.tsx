import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorState } from '../components/ui';
import { ApiError, playersApi } from '../api/client';
import { lerChaveDoGrupo, salvarChaveDoGrupo } from '../lib/chaveDoGrupo';

/**
 * Com a GROUP_KEY ligada, escrita sem conta é recusada com GROUP_KEY_REQUIRED.
 * O caminho de volta tem de funcionar sem ninguém explicar: o erro pede a
 * chave, a chave fica salva, e todo pedido seguinte já sai com ela.
 */

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('ErrorState pedindo a chave do grupo', () => {
  it('mostra o campo da chave quando o servidor pede', () => {
    render(<ErrorState error={new ApiError('Só para o grupo.', 401, 'GROUP_KEY_REQUIRED')} />);
    expect(screen.getByLabelText('Chave do grupo')).toBeInTheDocument();
  });

  it('não mostra o campo em erro comum', () => {
    render(<ErrorState error={new ApiError('Série não encontrada.', 404, 'SERIES_NOT_FOUND')} />);
    expect(screen.queryByLabelText('Chave do grupo')).not.toBeInTheDocument();
  });

  it('salva a chave neste navegador e tenta de novo', () => {
    const tentarDeNovo = vi.fn();
    render(
      <ErrorState
        error={new ApiError('Só para o grupo.', 401, 'GROUP_KEY_REQUIRED')}
        onRetry={tentarDeNovo}
      />
    );

    fireEvent.change(screen.getByLabelText('Chave do grupo'), { target: { value: ' abc123 ' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar chave/i }));

    expect(lerChaveDoGrupo()).toBe('abc123');
    expect(tentarDeNovo).toHaveBeenCalledOnce();
  });
});

describe('pedidos à API', () => {
  it('saem com a chave do grupo quando ela está salva', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] })));
    vi.stubGlobal('fetch', fetch);
    salvarChaveDoGrupo('abc123');

    await playersApi.list();

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-chave-do-grupo']).toBe('abc123');
  });

  it('saem sem o cabeçalho quando não há chave', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] })));
    vi.stubGlobal('fetch', fetch);

    await playersApi.list();

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers as Record<string, string>).not.toHaveProperty('x-chave-do-grupo');
  });
});
