import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A divisão que mais importa, verificada em vez de só descrita:
 *
 *   lib/       TypeScript puro -- sem Express, sem Prisma, sem serviço
 *   services/  regra de negócio -- conhece o Prisma (via db/)
 *   routes/    HTTP -- conhece o Express e chama serviço, nunca o banco
 *
 * A regra estava no CLAUDE.md e mesmo assim quebrou duas vezes sem ninguém ver:
 * o cliente Prisma morava em `lib/prisma.ts`, e `routes/ingest.ts` fazia a
 * importação inteira direto no banco. Texto não reprova PR; este teste reprova.
 */
const SRC = join(__dirname, '..');

const importsDe = (pasta: string) =>
  readdirSync(join(SRC, pasta))
    .filter((arquivo) => arquivo.endsWith('.ts'))
    .flatMap((arquivo) => {
      const texto = readFileSync(join(SRC, pasta, arquivo), 'utf8');
      return [...texto.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map(([, de]) => ({
        arquivo: `${pasta}/${arquivo}`,
        de,
      }));
    });

describe('camadas do servidor', () => {
  it('lib/ não importa Express, Prisma, banco, serviço nem rota', () => {
    const proibidos = importsDe('lib').filter(({ de }) =>
      /^(express|@prisma\/)|\/(db|services|routes|middleware)\//.test(de)
    );
    expect(proibidos).toEqual([]);
  });

  it('routes/ não fala com o banco: passa por um serviço', () => {
    const direto = importsDe('routes').filter(({ de }) => /\/db\/|@prisma\//.test(de));
    expect(direto).toEqual([]);
  });
});
