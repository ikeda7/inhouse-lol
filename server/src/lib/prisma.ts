import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { env } from './env.js';

/**
 * CLIENTE DO BANCO
 *
 * Um SQLite só, em dois lugares diferentes:
 *
 *   desenvolvimento  ->  arquivo local (server/prisma/dev.db)
 *   produção         ->  Turso (libSQL), que é SQLite hospedado
 *
 * Por que Turso e não Postgres: mantém o MESMO banco em dev e em prod. Trocar
 * de motor entre os dois ambientes é a origem clássica de "na minha máquina
 * funciona" -- comportamento de tipo, ordenação e concorrência divergem em
 * silêncio.
 *
 * Por que não SQLite em arquivo na nuvem: Vercel e afins têm filesystem
 * efêmero. O arquivo some a cada deploy e não é compartilhado entre
 * invocações. A escrita não dá erro -- ela simplesmente desaparece, que é pior.
 *
 * O adapter é usado nos DOIS casos, inclusive local. Assim o caminho exercitado
 * em desenvolvimento é o mesmo de produção; a única diferença é a URL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criarClient(): PrismaClient {
  const adapter = new PrismaLibSQL({
    url: env.databaseUrl,
    // Só o Turso exige token; arquivo local ignora.
    authToken: env.databaseAuthToken ?? undefined,
  });

  return new PrismaClient({
    adapter,
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * O `globalThis` evita esgotar conexões quando o tsx recarrega o módulo em
 * watch mode -- sem isso, cada salvamento de arquivo abre um pool novo. Em
 * serverless ele também reaproveita o cliente entre invocações da mesma
 * instância quente, o que corta o custo de conexão.
 */
export const prisma = globalForPrisma.prisma ?? criarClient();

if (env.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}
