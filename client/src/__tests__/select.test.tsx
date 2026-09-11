import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, type SelectOption } from '../components/Select';

/**
 * O Select próprio pelo teclado e pelo mouse.
 *
 * Trocar o `<select>` nativo cobrou o que o nativo dava de graça (setas, Enter,
 * Escape, busca por digitação), e o menu passou a morar no `body` com
 * `position: fixed` para não ser cortado pela tabela do formulário da Série
 * (useMenuFlutuante). É esse o comportamento que quebra calado: um clique na
 * opção contado como "clique fora", ou uma seta que para numa opção bloqueada.
 */

const OPCOES: SelectOption[] = [
  { value: 'a', label: 'Ana' },
  { value: 'b', label: 'Bruno', disabled: true, hint: 'escalado' },
  { value: 'k', label: 'Kaio' },
  { value: 'l', label: 'Léo' },
];

function montar(valor = '') {
  const onChange = vi.fn();
  render(
    <div>
      <Select value={valor} onChange={onChange} options={OPCOES} ariaLabel="Jogador" />
      <p>fora do select</p>
    </div>
  );
  return { onChange, botao: screen.getByRole('combobox', { name: 'Jogador' }) };
}

/** A opção que o leitor de tela anuncia como ativa (aria-activedescendant). */
const ativa = (botao: HTMLElement) =>
  document.getElementById(botao.getAttribute('aria-activedescendant') ?? '')?.textContent ?? '';

describe('Select', () => {
  it('abre pelo teclado, com a lista no body e fixa na janela', async () => {
    const { botao } = montar();
    botao.focus();
    await userEvent.keyboard('{ArrowDown}');

    const lista = screen.getByRole('listbox', { name: 'Jogador' });
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(lista.parentElement).toBe(document.body);
    expect(lista.style.position).toBe('fixed');
  });

  it('as setas pulam a opção bloqueada e o Enter escolhe, devolvendo o foco', async () => {
    const { botao, onChange } = montar();
    botao.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(ativa(botao)).toContain('Ana');

    // Bruno está escalado em outra linha: a seta vai direto para Kaio.
    await userEvent.keyboard('{ArrowDown}');
    expect(ativa(botao)).toContain('Kaio');

    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('k');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
  });

  it('Escape fecha sem escolher', async () => {
    const { botao, onChange } = montar();
    botao.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('digitar pula para o nome, como no select nativo', async () => {
    const { botao, onChange } = montar();
    botao.focus();
    await userEvent.keyboard('{ArrowDown}ka{Enter}');

    expect(onChange).toHaveBeenCalledWith('k');
  });

  it('clicar numa opção escolhe: a lista mora no body e o clique nela não conta como "fora"', async () => {
    const { botao, onChange } = montar();
    await userEvent.click(botao);
    await userEvent.click(screen.getByRole('option', { name: 'Léo' }));

    expect(onChange).toHaveBeenCalledWith('l');
  });

  it('clicar fora fecha', async () => {
    const { botao, onChange } = montar();
    await userEvent.click(botao);
    await userEvent.click(screen.getByText('fora do select'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a opção bloqueada aparece, com o motivo, e não escolhe', async () => {
    const { botao, onChange } = montar();
    await userEvent.click(botao);
    const bruno = screen.getByRole('option', { name: /Bruno/ });

    expect(bruno).toBeDisabled();
    expect(bruno).toHaveTextContent('escalado');
    await userEvent.click(bruno, { pointerEventsCheck: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
