/**
 * Quantos momentos uma noite mostra, para a grade dos Destaques fechar sem
 * cartão órfão.
 *
 * A grade tem 1 coluna no celular, 2 no tablet e 3 no desktop. Uma noite com
 * 13 momentos deixava um cartão sozinho na última linha nas duas larguras
 * maiores -- e o que quebrava a conta era justamente o feito mais raro da
 * noite (uma quadra), que entra além dos superlativos de cada jogo.
 *
 * A saída é cortar POUCO e só o que é redundante:
 *
 *   - no máximo 2 cortes por noite. Com isso sempre dá para chegar a um
 *     múltiplo de 3 (fecha o desktop), e às vezes a um múltiplo de 6 (fecha
 *     também o tablet);
 *   - quando sobra um múltiplo de 3 ímpar (9, 15...), o tablet fecha
 *     esticando o primeiro cartão pelas 2 colunas, em vez de cortar mais;
 *   - só sai momento REPETIDO: um tipo que já aparece em outro cartão da
 *     mesma noite (dois first bloods, duas visões). O de menor peso sai
 *     primeiro; dentro do tipo, o de menor valor;
 *   - quadra e penta nunca saem -- são o motivo de a tela existir.
 *
 * Noite com menos de 6 momentos não é cortada: cortar de uma noite curta
 * tiraria justamente o pouco que ela tem.
 */

interface MomentoCuravel {
  tipo: string;
  peso: number;
  valor: number;
}

export interface NoiteHarmonizada<T> {
  itens: T[];
  /** No tablet (2 colunas), o primeiro cartão ocupa a linha inteira. */
  primeiroLargoNoTablet: boolean;
}

/** Peso da quadra (ver PESO em server/src/services/highlights.ts). Daqui para cima, nunca sai. */
const PESO_INTOCAVEL = 90;
const MAX_CORTES = 2;
const MINIMO_PARA_CORTAR = 6;

function indiceDoMaisDispensavel(itens: readonly MomentoCuravel[]): number {
  const porTipo = new Map<string, number>();
  for (const item of itens) porTipo.set(item.tipo, (porTipo.get(item.tipo) ?? 0) + 1);

  let escolhido = -1;
  itens.forEach((item, i) => {
    if (item.peso >= PESO_INTOCAVEL || (porTipo.get(item.tipo) ?? 0) < 2) return;
    const atual = itens[escolhido];
    // Empate de peso e valor: sai o que vem depois na lista, que é o jogo
    // mais antigo da noite (a lista chega do mais recente para o mais antigo).
    if (
      !atual ||
      item.peso < atual.peso ||
      (item.peso === atual.peso && item.valor <= atual.valor)
    ) {
      escolhido = i;
    }
  });
  return escolhido;
}

export function harmonizarNoite<T extends MomentoCuravel>(
  itens: readonly T[]
): NoiteHarmonizada<T> {
  const total = itens.length;
  const cortes = total < MINIMO_PARA_CORTAR ? 0 : total % 6 <= MAX_CORTES ? total % 6 : total % 3;

  let restantes = [...itens];
  for (let i = 0; i < cortes; i++) {
    const indice = indiceDoMaisDispensavel(restantes);
    // Sem repetido suficiente para fechar a conta, não corta nada: meio
    // corte deixaria a noite menor e a grade continuaria quebrada.
    if (indice === -1) {
      restantes = [...itens];
      break;
    }
    restantes = restantes.filter((_, j) => j !== indice);
  }

  return {
    itens: restantes,
    primeiroLargoNoTablet: restantes.length >= MINIMO_PARA_CORTAR && restantes.length % 6 === 3,
  };
}
