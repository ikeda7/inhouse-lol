/**
 * Aplica o schema no Turso e copia os dados do banco local.
 *
 * Por que existe: `prisma db push` fala com arquivo SQLite, não com libSQL
 * remoto. O caminho suportado é gerar o SQL a partir do schema
 * (`prisma migrate diff`) e executá-lo pelo cliente libSQL.
 *
 * É idempotente na estrutura: as tabelas só são criadas se não existirem, e as
 * colunas que o schema ganhou depois entram por ALTER TABLE (ver
 * `colunasEsperadas`). Dados só são sobrescritos com `--force`, para não apagar
 * produção por engano.
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

/**
 * Colunas esperadas por tabela, lidas do SQL que o `prisma migrate diff` gerou.
 *
 * Existe porque `CREATE TABLE IF NOT EXISTS` não é migração: num banco que já
 * tem as tabelas, ele não faz nada e uma coluna nova do schema simplesmente
 * nunca chega no Turso -- em silêncio, que é o pior jeito de falhar. Com esse
 * mapa, o passo seguinte compara com o `PRAGMA table_info` real e emite os
 * `ALTER TABLE ADD COLUMN` que faltam.
 */
/** Tipos que o Prisma emite no provider sqlite. */
const TIPOS_SQLITE = 'TEXT|INTEGER|REAL|BLOB|NUMERIC|DECIMAL|BOOLEAN|DATETIME|JSONB?';

/**
 * Executa um statement dizendo qual era, se falhar.
 *
 * O erro cru do libSQL é só "syntax error at (1, 43)" -- sem o statement, isso
 * não localiza nada num script que roda 20+ comandos.
 */
async function executar(turso: ReturnType<typeof createClient>, sql: string) {
  try {
    await turso.execute(sql);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new Error(`Falhou em:\n${sql}\n\nMotivo: ${motivo}`);
  }
}

/**
 * Nomes das colunas de um `CREATE TABLE`, direto do texto.
 *
 * Casa `"nome" TIPO`, o que naturalmente ignora `FOREIGN KEY ("x")` e
 * `REFERENCES "T" ("id")` -- ali o identificador é seguido de parêntese, não de
 * um tipo. Funciona tanto no SQL multilinha do Prisma quanto no que o SQLite
 * devolve de volta.
 */
function colunasDeclaradas(createTable: string): Set<string> {
  const encontradas = createTable.matchAll(
    new RegExp(`"([A-Za-z_][A-Za-z0-9_]*)"\\s+(?:${TIPOS_SQLITE})\\b`, 'gi')
  );
  return new Set([...encontradas].map((m) => m[1]));
}

function colunasEsperadas(sql: string): Map<string, { nome: string; def: string }[]> {
  const porTabela = new Map<string, { nome: string; def: string }[]>();

  for (const bloco of sql.split(/CREATE TABLE /i).slice(1)) {
    const tabela = bloco.match(/^"([^"]+)"/)?.[1];
    if (!tabela) continue;

    const colunas = bloco
      .split('\n')
      .map((linha) => linha.trim().replace(/,$/, ''))
      // Nome entre aspas SEGUIDO DE UM TIPO. Exigir o tipo é o que descarta
      // CONSTRAINT/FOREIGN KEY/UNIQUE e, principalmente, a linha de abertura
      // `"Player" (` -- que sem isso virava uma "coluna" chamada Player.
      .filter((linha) => new RegExp(`^"[^"]+"\\s+(?:${TIPOS_SQLITE})\\b`, 'i').test(linha))
      .map((linha) => ({ nome: linha.match(/^"([^"]+)"/)![1], def: linha }))
      // PK não se adiciona por ALTER TABLE no SQLite; se faltar, o problema é
      // outro e um ADD COLUMN silencioso só esconderia.
      .filter((coluna) => !/PRIMARY KEY/i.test(coluna.def));

    porTabela.set(tabela, colunas);
  }

  return porTabela;
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

  // Índice vem DEPOIS da coluna existir.
  //
  // Numa base que já tem as tabelas, o `CREATE TABLE IF NOT EXISTS` é no-op e
  // as colunas novas só entram no passo 1b, por ALTER TABLE. Aplicar os índices
  // junto com o resto quebrava justamente a coluna nova que tem `@unique`:
  //
  //   CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email")
  //   -> SQL_INPUT_ERROR: no such column: "email"
  //
  // E como isso acontecia ANTES do 1b, nenhuma coluna chegava ao destino.
  const ehIndice = (c: string) => /^CREATE (UNIQUE )?INDEX/i.test(c);
  const estrutura = comandos.filter((c) => !ehIndice(c));
  const indices = comandos.filter(ehIndice);

  for (const comando of estrutura) {
    await executar(turso, comando);
  }
  console.log(`  ${estrutura.length} comando(s) de estrutura aplicado(s)`);

  // --- 1b. colunas que apareceram no schema depois da criação das tabelas ---
  let adicionadas = 0;
  for (const [tabela, colunas] of colunasEsperadas(sql)) {
    // `PRAGMA table_info` não passa no parser do libSQL (SQL_PARSE_ERROR), então
    // a fonte da verdade é o CREATE TABLE guardado pelo próprio SQLite.
    const atual = await turso.execute({
      sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      args: [tabela],
    });
    const criacao = atual.rows[0]?.sql;
    if (typeof criacao !== 'string') continue; // tabela acabou de nascer completa
    const presentes = colunasDeclaradas(criacao);

    for (const coluna of colunas) {
      if (presentes.has(coluna.nome)) continue;
      await executar(turso, `ALTER TABLE "${tabela}" ADD COLUMN ${coluna.def}`);
      console.log(`  + ${tabela}.${coluna.nome}`);
      adicionadas++;
    }
  }
  if (adicionadas === 0) console.log('  nenhuma coluna nova a adicionar');

  // --- 1c. agora sim os índices, com todas as colunas no lugar ---
  for (const comando of indices) {
    await executar(turso, comando);
  }
  console.log(`  ${indices.length} indice(s) aplicado(s)`);

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
