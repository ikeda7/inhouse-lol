/**
 * Os nomes que o próprio jogo dá aos feitos.
 *
 * "10 seguidos" é descrição; "LEGENDARY" é a palavra que o locutor grita e que
 * todo mundo do grupo reconhece na hora. Usar o vocabulário do jogo custa nada
 * e é a diferença entre a tela falar a língua de quem joga ou não.
 *
 * Os termos ficam em inglês de propósito: é o que a galera fala, mesmo com o
 * cliente em português. Ninguém diz "ele está Divino".
 */

/** Ponto em que cada nome de sequência começa a valer. */
const SEQUENCIAS = [
  { minimo: 8, termo: 'LEGENDARY' },
  { minimo: 7, termo: 'GODLIKE' },
  { minimo: 6, termo: 'DOMINATING' },
  { minimo: 5, termo: 'UNSTOPPABLE' },
  { minimo: 4, termo: 'RAMPAGE' },
  { minimo: 3, termo: 'KILLING SPREE' },
] as const;

/** Nome da sequência de abates sem morrer. */
export function nomeDaSequencia(abates: number): string {
  return SEQUENCIAS.find((faixa) => abates >= faixa.minimo)?.termo ?? 'KILLING SPREE';
}

/** Nome do multikill. */
export function nomeDoMultikill(abates: number): string {
  if (abates >= 5) return 'PENTAKILL';
  if (abates === 4) return 'QUADRA KILL';
  if (abates === 3) return 'TRIPLE KILL';
  return 'DOUBLE KILL';
}
