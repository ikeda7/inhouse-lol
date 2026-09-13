/**
 * Divisões de times que o sorteio já mostrou para estes 10, para "tenta outro"
 * nunca repetir os mesmos times. A lista vai para o servidor em `evitar`.
 *
 * Existe porque o sorteio equilibra pelo histórico: com a força de cada um
 * diferente, a divisão mais equilibrada é uma só, e trocar a seed devolvia
 * exatamente os mesmos times a cada clique.
 */
export interface DivisoesVistas {
  /** De qual elenco são (ids em ordem). Mudou quem veio, a lista não vale mais. */
  elenco: string;
  /** Um time de cada divisão já mostrada: basta um para saber a divisão. */
  times: string[][];
}

/** Abaixo do teto de 50 da rota: numa noite ninguém passa de algumas dezenas de cliques. */
export const MAX_DIVISOES_EVITADAS = 40;

export const chaveDoElenco = (ids: Iterable<string>): string => [...ids].sort().join(',');

export function divisoesAEvitar(vistas: DivisoesVistas | null, elenco: string): string[][] {
  return vistas?.elenco === elenco ? vistas.times : [];
}

/**
 * Soma o resultado novo à lista. Se a divisão já estava nela, o servidor não
 * achou nenhuma nova: a lista recomeça por ela em vez de crescer repetida.
 */
export function registrarDivisao(
  evitadas: string[][],
  azul: string[],
  vermelho: string[],
  elenco: string
): DivisoesVistas {
  const repetida = evitadas.some((time) => mesmoTime(time, azul) || mesmoTime(time, vermelho));
  const times = repetida ? [azul] : [...evitadas, azul].slice(-MAX_DIVISOES_EVITADAS);
  return { elenco, times };
}

function mesmoTime(a: string[], b: string[]): boolean {
  const ids = new Set(a);
  return a.length === b.length && b.every((id) => ids.has(id));
}
