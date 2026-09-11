import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AjudaPage } from '../pages/AjudaPage';

/**
 * A ajuda é texto, mas dois erros nela custam uma noite: um link para aba que
 * não existe mais, e um comando do agente que não aponta para produção (sem
 * `--api`, o agente fala com localhost e o jogo não entra).
 */
function renderizar() {
  return render(
    <MemoryRouter>
      <AjudaPage />
    </MemoryRouter>
  );
}

describe('AjudaPage', () => {
  it('leva a cada aba do site', () => {
    renderizar();
    const destinos = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    for (const aba of ['/', '/sorteio', '/serie', '/destaques', '/historico', '/jogadores']) {
      expect(destinos).toContain(aba);
    }
  });

  it('ensina o comando do agente apontando para produção', () => {
    renderizar();
    expect(screen.getByText(/--watch --api https:\/\/inhouse-lol\.vercel\.app\/api/)).toBeTruthy();
  });

  it('toda âncora do índice tem uma seção com esse id', () => {
    const { container } = renderizar();
    const ancoras = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('#'));
    expect(ancoras.length).toBeGreaterThan(0);
    for (const ancora of ancoras) {
      expect(container.querySelector(ancora)).not.toBeNull();
    }
  });
});
