import type { Player } from '../types';

/**
 * Filtros da aba Jogadores: atalho para cobrar quem falta.
 *
 * Conta (foto e perfil) é convite; Riot ID é o que faz a importação
 * reconhecer a pessoa. Inativo não entra em nenhuma falta: não joga, então não
 * precisa de uma coisa nem da outra.
 */
export type FiltroDeJogadores = 'todos' | 'sem-conta' | 'sem-riot-id';

export function filtrarJogadores(players: readonly Player[], filtro: FiltroDeJogadores): Player[] {
  if (filtro === 'sem-conta') return players.filter((p) => p.active && !p.hasAccount);
  if (filtro === 'sem-riot-id') return players.filter((p) => p.active && !p.riotId);
  return [...players];
}

export function contarPorFiltro(players: readonly Player[]): Record<FiltroDeJogadores, number> {
  return {
    todos: players.length,
    'sem-conta': filtrarJogadores(players, 'sem-conta').length,
    'sem-riot-id': filtrarJogadores(players, 'sem-riot-id').length,
  };
}
