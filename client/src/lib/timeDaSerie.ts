import type { MatchStat, SeriesDetail, TeamSide } from '../types';

/**
 * Quem é o "time A" de uma MD3 e de que lado ele jogou em cada jogo.
 *
 * Placar e agregados da série são por ELENCO, não por cor -- a mesma regra do
 * servidor (`computeSeriesStanding`): os times trocam de lado entre os jogos,
 * e contar azul contra vermelho transformaria um 2-0 num 1-1. Mora fora de
 * lib/imagem porque a imagem da série e as stats da série (lib/serieStats)
 * usam as duas funções.
 */

type Partida = Pick<SeriesDetail['matches'][number], 'matchNumber' | 'stats'>;

/** Quem jogou de azul no primeiro jogo: é essa gente que o placar chama de "time A". */
export function elencoDoTimeA(partidas: readonly Partida[]): Set<string> {
  const primeira = [...partidas].sort((a, b) => a.matchNumber - b.matchNumber)[0];
  return new Set(
    (primeira?.stats ?? []).filter((s) => s.teamSide === 'BLUE').map((s) => s.player.id)
  );
}

/**
 * Lado em que o time A jogou numa partida: o lado com a maioria do elenco.
 * Maioria, e não todos, para uma substituição no meio da MD3 não trocar o time
 * de identidade -- a mesma tolerância do servidor.
 */
export function ladoDoTimeA(
  stats: readonly Pick<MatchStat, 'teamSide' | 'player'>[],
  elencoA: ReadonlySet<string>
): TeamSide {
  const doLado = (lado: TeamSide) =>
    stats.filter((s) => s.teamSide === lado && elencoA.has(s.player.id)).length;
  return doLado('RED') > doLado('BLUE') ? 'RED' : 'BLUE';
}
