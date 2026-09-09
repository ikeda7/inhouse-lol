import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Testes do front (issue #10).
 *
 * `jsdom` porque parte do que vale testar aqui é comportamento de componente --
 * o selo que aparece ou não, a build que diz "indisponível" em vez de mostrar
 * slots vazios. Isso não dá para verificar chamando função pura.
 *
 * As consultas usam papel e rótulo acessível em vez de classe CSS: assim o
 * teste quebra quando o comportamento muda, não quando o Tailwind muda -- e de
 * quebra cobre acessibilidade, já que vários componentes dependem de
 * `aria-expanded` e `aria-pressed` que ninguém verificava.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
