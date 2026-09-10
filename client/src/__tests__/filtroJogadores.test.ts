import { describe, expect, it } from 'vitest';
import { contarPorFiltro, filtrarJogadores } from '../lib/filtroJogadores';
import type { Player } from '../types';

function jogador(nome: string, extra: Partial<Player> = {}): Player {
  return {
    id: nome,
    name: nome,
    riotId: `${nome}#BR1`,
    roles: ['MID'],
    internalRating: 1000,
    active: true,
    hasAccount: true,
    photoUrl: null,
    photoSource: 'NONE',
    ...extra,
  };
}

const elenco = [
  jogador('Em Dia'),
  jogador('Sem Conta', { hasAccount: false }),
  jogador('Sem Riot', { riotId: null }),
  jogador('Sem Nada', { hasAccount: false, riotId: null }),
  jogador('Inativo', { active: false, hasAccount: false, riotId: null }),
];

const nomes = (lista: Player[]) => lista.map((p) => p.name);

describe('filtrarJogadores', () => {
  it('"todos" devolve todo mundo, inativo incluído', () => {
    expect(filtrarJogadores(elenco, 'todos')).toHaveLength(5);
  });

  it('"sem conta" traz só quem joga e ainda não criou conta', () => {
    expect(nomes(filtrarJogadores(elenco, 'sem-conta'))).toEqual(['Sem Conta', 'Sem Nada']);
  });

  it('"sem Riot ID" traz só quem joga e a importação não reconheceria', () => {
    expect(nomes(filtrarJogadores(elenco, 'sem-riot-id'))).toEqual(['Sem Riot', 'Sem Nada']);
  });

  it('inativo não conta como falta: não joga', () => {
    expect(nomes(filtrarJogadores(elenco, 'sem-conta'))).not.toContain('Inativo');
    expect(nomes(filtrarJogadores(elenco, 'sem-riot-id'))).not.toContain('Inativo');
  });
});

describe('contarPorFiltro', () => {
  it('conta cada filtro com a mesma regra da lista', () => {
    expect(contarPorFiltro(elenco)).toEqual({ todos: 5, 'sem-conta': 2, 'sem-riot-id': 2 });
  });
});
