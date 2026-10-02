/**
 * Endereços de dentro do site, num lugar só.
 *
 * Um jogo aparece em quatro telas (perfil, recordes, momentos, série) e todas
 * têm de levar ao MESMO lugar: a série aberta no Histórico, com o jogo em
 * foco. Montar a query string em cada tela é o jeito de uma delas escrever
 * `?jogo=` e a outra `?match=`.
 */

/** A série aberta no Histórico; com `jogo`, rolada até ele. */
export function linkDaSerie(seriesId: string, jogo?: number): string {
  const consulta = new URLSearchParams({ serie: seriesId });
  if (jogo !== undefined) consulta.set('jogo', String(jogo));
  return `/historico?${consulta.toString()}`;
}

export function linkDoJogador(playerId: string): string {
  return `/jogadores/${playerId}`;
}
