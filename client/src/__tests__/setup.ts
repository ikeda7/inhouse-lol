import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Desmonta a árvore entre testes.
 *
 * Sem isso os componentes se acumulam no mesmo documento e uma consulta por
 * texto encontra o resultado do teste ANTERIOR -- falha que aparece como
 * "achou dois elementos" num teste que não tem nada a ver com o problema.
 */
afterEach(() => {
  cleanup();
});

/**
 * `scrollIntoView` não existe em jsdom.
 *
 * O `Select` chama isso para manter a opção ativa visível ao navegar de seta.
 * Sem o stub, qualquer teste que ABRA um select quebra com "not a function" --
 * um detalhe do ambiente de teste aparecendo como falha do componente.
 */
Element.prototype.scrollIntoView = () => {};
