import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Configuracao do Prisma CLI.
 *
 * O motivo de existir: o CLI procura o `.env` ao lado do schema
 * (server/prisma/.env) ou no cwd (server/), mas neste projeto o `.env` fica na
 * RAIZ do repositorio -- um so, compartilhado por front e back. Sem este
 * arquivo, `prisma db push` falha com "Environment variable not found:
 * DATABASE_URL" mesmo com o .env preenchido.
 *
 * Substitui tambem a chave `prisma` do package.json, deprecada na v6 e removida
 * na v7.
 */
const here = path.dirname(fileURLToPath(import.meta.url)); // server/
const repoRoot = path.resolve(here, '..');

loadDotenv({ path: path.join(repoRoot, '.env') });
loadDotenv({ path: path.join(here, '.env'), override: true });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
