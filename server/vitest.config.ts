import { defineConfig } from 'vitest/config';

/**
 * Superfície de teste explícita.
 *
 * Sem `include`, o vitest varre a pasta inteira -- e passou a incluir `dist/`,
 * ou seja, os testes do ÚLTIMO BUILD. Localmente isso rodava 153 testes em vez
 * de 91, metade deles contra código compilado antigo: verde que não significa
 * nada. (No CI não acontecia, porque `dist/` é gitignored e o build roda depois
 * dos testes -- o que só torna o problema mais difícil de perceber.)
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
