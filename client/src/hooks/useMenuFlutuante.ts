import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Folga entre o menu e a borda da janela. */
const MARGEM = 8;
/** Mesma altura do `max-h-64` que os menus tinham. */
const ALTURA_MAXIMA = 256;
/** Abaixo disso, se em cima couber mais, o menu abre para cima. */
const ALTURA_MINIMA_EMBAIXO = 160;

/**
 * Onde desenhar um menu aberto: fixo na janela, colado no campo que o abriu.
 *
 * Menu `absolute` fica preso a quem corta. No formulário da Série a tabela tem
 * `overflow-x-auto` -- que também corta na vertical -- e o card tem
 * `overflow-hidden`: nas últimas linhas o menu de jogador e a lista de
 * campeões abriam escondidos, e o Select ainda rolava a tabela por dentro para
 * mostrar a opção ativa. Com `position: fixed` e o menu no `body`, nenhum
 * ancestral corta; quando não cabe embaixo, abre para cima.
 *
 * Recalcula em qualquer rolagem (captura, para pegar a da tabela também) e ao
 * redimensionar, para o menu acompanhar o campo.
 */
export function useMenuFlutuante(
  ancora: RefObject<HTMLElement | null>,
  aberto: boolean,
  larguraMinima = 0
): CSSProperties | null {
  const [estilo, setEstilo] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!aberto) {
      setEstilo(null);
      return;
    }

    const calcular = () => {
      const campo = ancora.current;
      if (!campo) return;
      const caixa = campo.getBoundingClientRect();
      const embaixo = window.innerHeight - caixa.bottom - MARGEM;
      const emCima = caixa.top - MARGEM;
      const paraCima = embaixo < ALTURA_MINIMA_EMBAIXO && emCima > embaixo;
      const largura = Math.max(caixa.width, larguraMinima);
      const esquerda = Math.max(MARGEM, Math.min(caixa.left, window.innerWidth - largura - MARGEM));

      setEstilo({
        position: 'fixed',
        left: esquerda,
        width: largura,
        ...(paraCima
          ? {
              bottom: window.innerHeight - caixa.top + 4,
              maxHeight: Math.min(ALTURA_MAXIMA, emCima),
            }
          : { top: caixa.bottom + 4, maxHeight: Math.min(ALTURA_MAXIMA, embaixo) }),
      });
    };

    calcular();
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', calcular, true);
    return () => {
      window.removeEventListener('resize', calcular);
      window.removeEventListener('scroll', calcular, true);
    };
  }, [aberto, ancora, larguraMinima]);

  return estilo;
}

/**
 * Rola só a própria lista até o item, sem mexer em nenhum ancestral.
 * `scrollIntoView` rolava também a tabela do formulário por dentro.
 */
export function mostrarNaLista(lista: HTMLElement | null, item: HTMLElement | null) {
  if (!lista || !item) return;
  const topo = item.offsetTop;
  const base = topo + item.offsetHeight;
  if (topo < lista.scrollTop) lista.scrollTop = topo;
  else if (base > lista.scrollTop + lista.clientHeight) lista.scrollTop = base - lista.clientHeight;
}
