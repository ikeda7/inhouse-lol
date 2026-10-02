import { useEffect } from 'react';
import { tituloDaTela } from '../lib/titulos';

/**
 * Troca o título da aba pelo nome de algo que só a tela conhece depois de
 * carregar (o nome do jogador no perfil). Enquanto `nome` é nulo vale o título
 * da rota, posto pelo `EfeitosDeNavegacao`.
 */
export function useTituloDaPagina(nome: string | null | undefined): void {
  useEffect(() => {
    if (nome) document.title = tituloDaTela(nome);
  }, [nome]);
}
