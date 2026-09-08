/**
 * Seed da base de jogadores.
 *
 * A lista fecha exatamente os 10 jogadores necessarios para o 5x5.
 * Igor e jungler puro (pool de uma role so), entao e sempre um dos primeiros
 * a ser alocado pelo algoritmo -- e o gargalo mais apertado do elenco.
 *
 * A ORDEM do array `roles` importa: o primeiro item e a role principal, e o
 * auto-balance usa isso para decidir quem sai da main quando alguem precisa
 * sair. "Fill" significa "jogo as 5".
 *
 * Rodar: npm run db:seed  (idempotente -- pode rodar quantas vezes quiser)
 */

// Importado primeiro: resolve o .env da raiz antes do PrismaClient ler DATABASE_URL.
import '../src/lib/env.js';
import { PrismaClient } from '@prisma/client';
import { normalizeRole } from '../src/lib/roles.js';

const prisma = new PrismaClient();

const SEED_PLAYERS: { name: string; roles: string[] }[] = [
  { name: 'Vini', roles: ['Jungle', 'Top', 'ADC'] },
  { name: 'Kayon', roles: ['Jungle', 'Mid'] },
  { name: 'Denyon', roles: ['Top', 'ADC'] },
  { name: 'Cangosul', roles: ['Support', 'Top', 'Jungle'] },
  { name: 'Lara', roles: ['Mid', 'Support', 'ADC'] },
  { name: 'Ikeda', roles: ['Fill'] },
  { name: 'Bruno', roles: ['Mid', 'Support', 'Jungle'] },
  { name: 'Léo', roles: ['Mid', 'Jungle', 'ADC'] },
  { name: 'Kaio', roles: ['Support', 'Mid', 'ADC'] },
  { name: 'Ígor', roles: ['Jungle'] },
];

async function main() {
  console.log(`Semeando ${SEED_PLAYERS.length} jogadores...`);

  for (const entry of SEED_PLAYERS) {
    const roles = entry.roles.map(normalizeRole);

    // upsert pelo nome (que e unique) deixa o seed idempotente: rodar de novo
    // atualiza o pool de roles em vez de estourar em unique constraint.
    const player = await prisma.player.upsert({
      where: { name: entry.name },
      create: {
        name: entry.name,
        roles: { create: roles.map((role, priority) => ({ role, priority })) },
      },
      update: {},
      include: { roles: true },
    });

    // Re-sincroniza as roles caso o seed tenha mudado desde a ultima execucao.
    await prisma.playerRole.deleteMany({ where: { playerId: player.id } });
    await prisma.playerRole.createMany({
      data: roles.map((role, priority) => ({ playerId: player.id, role, priority })),
    });

    console.log(`  ${entry.name.padEnd(10)} -> ${roles.join(', ')}`);
  }

  const total = await prisma.player.count();
  console.log(`\nPronto. ${total} jogadores na base.`);
  if (total < 10) {
    console.log(
      `AVISO: o sorteio 5x5 precisa de 10 jogadores presentes. Faltam ${10 - total}.`
    );
  }
}

main()
  .catch((error) => {
    console.error('Falha no seed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
