/**
 * Recalcula o placar de todas as MD3 a partir dos jogos gravados.
 *
 * Quando usar:
 *  - depois de mudar a regra de como uma serie e pontuada;
 *  - depois de corrigir manualmente o resultado de um jogo;
 *  - para conferir se o placar armazenado bate com os jogos.
 *
 * Motivo de existir: o placar fica denormalizado em `Series` para o historico
 * nao precisar agregar tudo a cada listagem. Denormalizacao precisa de uma
 * forma de reconstruir a verdade -- e este script.
 *
 * Uso:
 *   npm run db:recompute --workspace server
 *   npm run db:recompute --workspace server -- --dry-run
 */

import '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { computeSeriesStanding, WINS_TO_CLINCH } from '../src/services/series.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const series = await prisma.series.findMany({
    orderBy: { date: 'asc' },
    include: {
      matches: {
        select: {
          matchNumber: true,
          winner: true,
          stats: { select: { playerId: true, teamSide: true } },
        },
      },
    },
  });

  if (series.length === 0) {
    console.log('Nenhuma serie no banco.');
    return;
  }

  console.log(`${series.length} serie(s)${dryRun ? '  [dry-run: nada sera gravado]' : ''}\n`);

  let alteradas = 0;

  for (const s of series) {
    const { teamAWins, teamBWins, rostersUnstable } = computeSeriesStanding(s.matches);
    const clinched = teamAWins >= WINS_TO_CLINCH || teamBWins >= WINS_TO_CLINCH;
    const status = clinched ? 'FINISHED' : s.status;
    const winnerTeam = clinched ? (teamAWins > teamBWins ? 'BLUE' : 'RED') : s.winnerTeam;

    const mudou =
      s.blueScore !== teamAWins || s.redScore !== teamBWins || s.status !== status;

    const rotulo = (s.name ?? s.id.slice(0, 8)).padEnd(18);
    const antes = `${s.blueScore}-${s.redScore} ${s.status}`.padEnd(20);
    const depois = `${teamAWins}-${teamBWins} ${status}`;

    if (!mudou) {
      console.log(`  ok        ${rotulo} ${depois}`);
      continue;
    }

    alteradas++;
    console.log(
      `  CORRIGIDO ${rotulo} ${antes} -> ${depois}` +
        (rostersUnstable ? '   (elencos instaveis: conferir)' : '')
    );

    if (!dryRun) {
      await prisma.series.update({
        where: { id: s.id },
        data: { blueScore: teamAWins, redScore: teamBWins, status, winnerTeam },
      });
    }
  }

  console.log(
    `\n${alteradas} serie(s) ${dryRun ? 'seriam corrigidas' : 'corrigidas'}, ` +
      `${series.length - alteradas} ja estavam certas.`
  );
}

main()
  .catch((error) => {
    console.error('Falha ao recalcular:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
