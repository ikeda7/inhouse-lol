/**
 * Estatisticas e recordes por campeao: pick, ban, presenca, aproveitamento,
 * KDA e dano -- do campeao, nao de quem jogou.
 *
 * A regra mora em lib/estatisticasDeCampeao.ts (pura). Aqui e so a leitura do
 * banco e a resolucao do icone -- inclusive a do NOME de um ban antigo, que
 * pode ter chegado so com o id numerico.
 */

import { prisma } from '../db/prisma.js';
import { resolveChampion } from '../lib/ddragon.js';
import {
  estatisticasDeCampeao,
  recordesDosCampeoes,
  type BanimentoDeCampeao,
  type EstatisticaDeCampeao,
  type RecordeDoCampeao,
} from '../lib/estatisticasDeCampeao.js';

export interface CampeaoNaTela extends EstatisticaDeCampeao {
  championIcon: string | null;
}

export interface RecordeNaTela extends RecordeDoCampeao {
  championIcon: string | null;
}

export interface EstatisticasDeCampeoes {
  campeoes: CampeaoNaTela[];
  /** Um por categoria: mais escolhido, mais banido, maior presenca, ... */
  recordes: RecordeNaTela[];
  /** Denominador do pick/ban rate: a tela avisa quando e pouca partida. */
  partidas: number;
}

export async function getEstatisticasDeCampeoes(): Promise<EstatisticasDeCampeoes> {
  const [escolhas, bans, partidas] = await Promise.all([
    prisma.matchPlayerStat.findMany({
      select: {
        championName: true,
        championId: true,
        win: true,
        kills: true,
        deaths: true,
        assists: true,
        damage: true,
        match: { select: { gameDurationSec: true } },
        player: { select: { id: true, name: true } },
      },
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
      kills: escolha.kills,
      deaths: escolha.deaths,
      assists: escolha.assists,
      damage: escolha.damage,
      duracaoEmSegundos: escolha.match.gameDurationSec,
      playerId: escolha.player.id,
      playerName: escolha.player.name,
    })),
    banimentos,
    partidas
  );

  // Um lookup por campeão, reaproveitado pela tabela e pelos recordes.
  const icones = new Map<string, string | null>();
  for (const campeao of lista) {
    const asset = await resolveChampion(campeao.championName).catch(() => null);
    icones.set(campeao.championName, asset?.id ?? null);
  }

  return {
    campeoes: lista.map((campeao) => ({
      ...campeao,
      championIcon: icones.get(campeao.championName) ?? null,
    })),
    recordes: recordesDosCampeoes(lista).map((recorde) => ({
      ...recorde,
      championIcon: icones.get(recorde.championName) ?? null,
    })),
    partidas,
  };
}
