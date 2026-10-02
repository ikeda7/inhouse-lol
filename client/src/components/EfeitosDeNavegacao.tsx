import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { tituloDaRota } from '../lib/titulos';

/**
 * O que acontece ao trocar de tela, e que o roteador não faz sozinho. Não
 * desenha nada.
 *
 * - **Título da aba.** Cada rota tem o seu (lib/titulos.ts).
 * - **Rolagem.** Num site de página única, clicar num link no fim de uma lista
 *   abria a tela seguinte já rolada até o fim: quem tocava no último jogador da
 *   lista caía no rodapé do perfil dele. Indo PARA uma tela, ela começa do
 *   topo; voltando (botão voltar do navegador), a posição é a que o navegador
 *   lembra. Só a troca de CAMINHO conta: abrir e fechar série no Histórico
 *   muda a consulta (?serie=), e ali quem rola é a própria tela.
 */
export function EfeitosDeNavegacao() {
  const { pathname } = useLocation();
  const tipo = useNavigationType();

  useEffect(() => {
    document.title = tituloDaRota(pathname);
  }, [pathname]);

  useEffect(() => {
    if (tipo !== 'POP') window.scrollTo(0, 0);
    // `tipo` fica de fora de propósito: ele muda junto com o caminho, e listá-lo
    // faria um "voltar" seguido de um clique rolar duas vezes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
