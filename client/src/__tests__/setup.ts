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
