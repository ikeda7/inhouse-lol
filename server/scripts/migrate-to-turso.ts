/**
 * Aplica o schema no Turso e copia os dados do banco local.
 *
 * Por que existe: `prisma db push` fala com arquivo SQLite, não com libSQL
 * remoto. O caminho suportado é gerar o SQL a partir do schema
 * (`prisma migrate diff`) e executá-lo pelo cliente libSQL.
 *
 * É idempotente na estrutura (CREATE TABLE só roda se as tabelas não existirem)
 * e recusa sobrescrever dados sem `--force`, para não apagar produção por
 * engano.
 *
 * Uso:
 *   npm run db:turso --workspace server               copia local -> Turso
 *   npm run db:turso --workspace server -- --force    sobrescreve o destino
 *   npm run db:turso --workspace server -- --schema-only
 *
 * Credenciais: lidas de `.env.turso` na raiz (gitignored).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@libsql/client';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..', '..');

const force = process.argv.includes('--force');
const schemaOnly = process.argv.includes('--schema-only');

/** Lê `.env.turso` sem depender do dotenv, que já carregou o `.env` normal. */
function credenciais(): { url: string; authToken: string } {
  const arquivo = path.join(raiz, '.env.turso');
  if (!existsSync(arquivo)) {
    throw new Error(
      'Crie .env.turso na raiz com DATABASE_URL e DATABASE_AUTH_TOKEN do Turso.'
    );
  }

  const conteudo = readFileSync(arquivo, 'utf8');
  const pegar = (chave: string) =>
    conteudo.match(new RegExp(`^${chave}\\s*=\\s*"?([^"\\n]+)"?`, 'm'))?.[1]?.trim();

  const url = pegar('DATABASE_URL');
  const authToken = pegar('DATABASE_AUTH_TOKEN');
  if (!url || !authToken) throw new Error('.env.turso sem DATABASE_URL ou DATABASE_AUTH_TOKEN.');
  return { url, authToken };
}

/** Ordem de inserção: pai antes de filho, por causa das foreign keys. */
const TABELAS = [
  'Player',
  'PlayerRole',
  'Series',
  'Match',
  'MatchPlayerStat',
  'BurnedChampion',
] as const;

async function main() {
  const { url, authToken } = credenciais();
  console.log(`destino: ${url.replace(/\/\/[^.]+/, '//***')}\n`);

  const turso = createClient({ url, authToken });

  // --- 1. estrutura ---
  console.log('=== schema ===');
  const sql = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema-datamodel',
      path.join(raiz, 'server', 'prisma', 'schema.prisma'),
      '--script',
    ],
    { encoding: 'utf8', cwd: raiz, shell: process.platform === 'win32' }
  );

  const comandos = sql
    .split(';')
    // Cada statement vem precedido de um comentário ("-- CreateTable"), então
    // as linhas de comentário são removidas DENTRO do bloco. Descartar o bloco
    // inteiro por começar com "--" apagaria todos os CREATE TABLE.
    .map((bloco) =>
      bloco
        .split('\n')
        .filter((linha) => !linha.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((c) => c.length > 0)
    // Tolera re-execução: sem isso, rodar duas vezes quebra na segunda.
    .map((c) =>
      c
        .replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ')
        .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ')
    );

  if (comandos.length === 0) {
    throw new Error(
      'Nenhum comando SQL gerado pelo `prisma migrate diff`. ' +
        'Rode o comando manualmente para ver a saída.'
    );
  }

  for (const comando of comandos) {
    await turso.execute(comando);
  }
  console.log(`  ${comandos.length} comando(s) aplicado(s)`);

  if (schemaOnly) {
    console.log('\n--schema-only: dados não foram copiados.');
    return;
  }

  // --- 2. o destino já tem dados? ---
  const jaTem = await turso.execute('SELECT COUNT(*) AS n FROM Player');
  const existentes = Number(jaTem.rows[0]?.n ?? 0);
  if (existentes > 0 && !force) {
    console.log(
      `\nO destino já tem ${existentes} jogador(es). Nada foi copiado.\n` +
        'Use --force para sobrescrever (apaga o que está no Turso).'
    );
    return;
  }

  // --- 3. copia ---
  const localDb = path.join(raiz, 'server', 'prisma', 'dev.db');
  if (!existsSync(localDb)) throw new Error(`Banco local não encontrado: ${localDb}`);

  const local = new PrismaClient({
    adapter: new PrismaLibSQL({ url: `file:${localDb}` }),
  });

  console.log('\n=== dados ===');

  if (force && existentes > 0) {
    // Ordem inversa da inserção: filho antes de pai.
    for (const tabela of [...TABELAS].reverse()) {
      await turso.execute(`DELETE FROM "${tabela}"`);
    }
    console.log('  destino limpo');
  }

  for (const tabela of TABELAS) {
    const linhas: Record<string, unknown>[] = await local.$queryRawUnsafe(
      `SELECT * FROM "${tabela}"`
    );
    if (linhas.length === 0) {
      console.log(`  ${tabela.padEnd(16)} vazio`);
      continue;
    }

    const colunas = Object.keys(linhas[0]);
    const marcadores = colunas.map(() => '?').join(', ');
    const insert = `INSERT INTO "${tabela}" (${colunas.map((c) => `"${c}"`).join(', ')}) VALUES (${marcadores})`;

    await turso.batch(
      linhas.map((linha) => ({
        sql: insert,
        // Date -> epoch ms; o driver do SQLite não aceita objeto Date.
        args: colunas.map((c) => {
          const v = linha[c];
          if (v instanceof Date) return v.getTime();
          if (typeof v === 'boolean') return v ? 1 : 0;
          return v as never;
        }),
      })),
      'write'
    );

    console.log(`  ${tabela.padEnd(16)} ${linhas.length} linha(s)`);
  }

  await local.$disconnect();

  // --- 4. confere ---
  console.log('\n=== conferência no Turso ===');
  for (const tabela of TABELAS) {
    const r = await turso.execute(`SELECT COUNT(*) AS n FROM "${tabela}"`);
    console.log(`  ${tabela.padEnd(16)} ${r.rows[0]?.n}`);
  }
}

main().catch((error) => {
  console.error('\nFalhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
