/**
 * Estatisticas por campeao do grupo: pick, ban, presenca e aproveitamento.
 *
 * A regra mora em lib/estatisticasDeCampeao.ts (pura). Aqui e so a leitura do
 * banco e a resolucao do icone -- inclusive a do NOME de um ban antigo, que
 * pode ter chegado so com o id numerico.
 */

import { prisma } from '../db/prisma.js';
import { resolveChampion } from '../lib/ddragon.js';
import {
  estatisticasDeCampeao,
  type BanimentoDeCampeao,
  type EstatisticaDeCampeao,
} from '../lib/estatisticasDeCampeao.js';

export interface CampeaoNaTela extends EstatisticaDeCampeao {
  championIcon: string | null;
}

export interface EstatisticasDeCampeoes {
  campeoes: CampeaoNaTela[];
  /** Denominador do pick/ban rate: a tela avisa quando e pouca partida. */
  partidas: number;
}

export async function getEstatisticasDeCampeoes(): Promise<EstatisticasDeCampeoes> {
  const [escolhas, bans, partidas] = await Promise.all([
    prisma.matchPlayerStat.findMany({
      select: { championName: true, championId: true, win: true },
    }),
    prisma.matchBan.findMany({ select: { championName: true, championId: true } }),
    prisma.match.count(),
  ]);

  const banimentos: BanimentoDeCampeao[] = [];
  for (const ban of bans) {
    // Ban antigo pode ter vindo so com o id: sem nome ele nao se junta ao pick
    // do mesmo campeao e a presenca sairia partida ao meio.
    const nome =
      ban.championName ?? (await resolveChampion(ban.championId).catch(() => null))?.name;
    if (!nome) continue;
    banimentos.push({ championName: nome, championId: ban.championId });
  }

  const lista = estatisticasDeCampeao(
    escolhas.map((escolha) => ({
      championName: escolha.championName,
      championId: escolha.championId,
      win: escolha.win,
    })),
    banimentos,
    partidas
  );

  const campeoes: CampeaoNaTela[] = [];
  for (const campeao of lista) {
    const asset = await resolveChampion(campeao.championName).catch(() => null);
    campeoes.push({ ...campeao, championIcon: asset?.id ?? null });
  }

  return { campeoes, partidas };
}
