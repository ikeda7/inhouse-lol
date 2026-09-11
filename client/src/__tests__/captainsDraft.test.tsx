import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptainsDraft } from '../components/CaptainsDraft';
import type { CaptainsDraftState, DraftablePlayer, TeamSide } from '../types';

/**
 * O draft de capitães gira em torno de uma pergunta: de quem é a vez. É o que
 * se confunde ao vivo ("agora é minha de novo?") e o que a tela tem que dizer
 * sem ambiguidade -- um só time aceso, o pote clicável só para quem pode
 * escolher, e nada clicável depois que fecha.
 */

const jogador = (id: string, nome: string): DraftablePlayer => ({
  id,
  name: nome,
  roles: ['MID'],
  rating: 1000,
});

const CAPITAO_AZUL = jogador('c-azul', 'Capitão Azul');
const CAPITAO_VERMELHO = jogador('c-verm', 'Capitão Vermelho');
const POTE = ['Ana', 'Bia', 'Caio', 'Duda', 'Enzo', 'Fábio', 'Gil', 'Hugo'].map((nome, i) =>
  jogador(`p${i}`, nome)
);
/** 1-2-2-2-1: azul, vermelho, vermelho, azul, azul, vermelho, vermelho, azul. */
const FILA: TeamSide[] = ['BLUE', 'RED', 'RED', 'BLUE', 'BLUE', 'RED', 'RED', 'BLUE'];

function estado(mudanca: Partial<CaptainsDraftState> = {}): CaptainsDraftState {
  return {
    captains: { BLUE: CAPITAO_AZUL, RED: CAPITAO_VERMELHO },
    available: POTE,
    picks: { BLUE: [CAPITAO_AZUL], RED: [CAPITAO_VERMELHO] },
    onTheClock: 'BLUE',
    pickNumber: 1,
    finished: false,
    pickOrder: FILA.map((side, i) => ({ order: i + 1, side })),
    ...mudanca,
  };
}

function montar(props: Partial<Parameters<typeof CaptainsDraft>[0]> = {}) {
  const onPick = vi.fn();
  render(
    <CaptainsDraft
      state={estado()}
      onPick={onPick}
      escolhendo={false}
      erro={null}
      onReiniciar={() => {}}
      {...props}
    />
  );
  return { onPick };
}

const botaoDoPote = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome}`) });

describe('CaptainsDraft', () => {
  it('acende só o time da vez; o outro mostra quantos já tem', () => {
    montar();

    const vez = screen.getAllByText('é a vez');
    expect(vez).toHaveLength(1);
    expect(vez[0].closest('p')).toHaveTextContent(/^Azul/);
    expect(screen.getByText('Vermelho').closest('p')).toHaveTextContent('1/5');
  });

  it('a vez troca de lado com o estado', () => {
    montar({ state: estado({ onTheClock: 'RED', pickNumber: 2 }) });

    expect(screen.getByText('é a vez').closest('p')).toHaveTextContent(/^Vermelho/);
  });

  it('clicar no pote escolhe aquela pessoa', async () => {
    const { onPick } = montar();
    await userEvent.click(botaoDoPote('Caio'));

    expect(onPick).toHaveBeenCalledWith('p2');
  });

  it('quem não é o capitão da vez vê o pote travado, em modo assistindo', () => {
    montar({ podeEscolher: false });

    expect(screen.getByText('assistindo')).toBeInTheDocument();
    for (const { name } of POTE) expect(botaoDoPote(name)).toBeDisabled();
  });

  it('trava o pote enquanto uma escolha está a caminho do servidor', () => {
    montar({ escolhendo: true });

    expect(botaoDoPote('Ana')).toBeDisabled();
  });

  it('draft fechado: ninguém na vez e nada para clicar no pote', () => {
    montar({
      state: estado({ finished: true, onTheClock: null, available: [], pickNumber: 9 }),
    });

    expect(screen.getByText(/Draft fechado/)).toBeInTheDocument();
    expect(screen.queryByText('é a vez')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ana/ })).not.toBeInTheDocument();
  });

  it('desenha a fila 1-2-2-2-1 inteira, com o lado de cada escolha', () => {
    montar();

    FILA.forEach((side, i) => {
      const cor = side === 'BLUE' ? 'azul' : 'vermelho';
      expect(screen.getByTitle(`Escolha ${i + 1} · time ${cor}`)).toBeInTheDocument();
    });
  });
});
