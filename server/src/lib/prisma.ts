import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Instancia unica do Prisma.
 *
 * O `globalThis` evita esgotar conexoes quando o tsx recarrega o modulo em
 * watch mode -- sem isso, cada salvamento de arquivo abre um pool novo.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}
