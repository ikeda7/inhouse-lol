import { Router } from 'express';
import { z } from 'zod';
import { hasRiotApi } from '../lib/env.js';
import {
  captureLiveMatchId,
  fetchMatch,
  getAccountByRiotId,
  RiotApiError,
  type ImportedMatch,
} from '../lib/riot.js';
import { prisma } from '../lib/prisma.js';
import { getChampionManifest } from '../lib/ddragon.js';
import { getBuildManifest } from '../lib/ddragonBuild.js';
import { recordMatch, type MatchPlayerInput } from '../services/series.js';
import { asyncHandler } from './helpers.js';

export const riotRouter = Router();

/**
 * GET /api/riot/status - a chave da Riot esta configurada?
 *
 * Consumido pela tela de conta para nao oferecer "Usar icone do LoL" quando o
 * servidor nao tem como cumprir. O comentario aqui dizia que a UI usava isso
 * bem antes de alguma tela consumir de fato -- ficou meses descrevendo uma
 * intencao, nao o codigo.
 */
riotRouter.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      enabled: hasRiotApi,
      note: hasRiotApi
        ? 'Custom games não aparecem no histórico por PUUID; informe o Match ID ou capture durante o jogo.'
        : 'RIOT_API_KEY ausente. Use o registro manual.',
    },
  });
});

/** GET /api/riot/champions - manifesto do Data Dragon (versao + icones). */
riotRouter.get(
  '/champions',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getChampionManifest() });
  })
);

/**
 * GET /api/riot/build - itens, feiticos e runas.
 *
 * Separado de /champions porque e bem maior (~500 itens) e so a tela de
 * historico precisa. Quem abre o ranking nao paga por isso.
 */
riotRouter.get(
  '/build',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getBuildManifest() });
  })
);

const linkSchema = z.object({
  playerId: z.string().min(1),
  riotId: z.string().regex(/^.+#.+$/, 'Formato esperado: Nick#TAG'),
});

/**
 * POST /api/riot/link
 * Resolve o Riot ID para PUUID e guarda no jogador. O PUUID e o que casa os
 * participantes da partida com o cadastro local.
 */
riotRouter.post(
  '/link',
  asyncHandler(async (req, res) => {
    const { playerId, riotId } = linkSchema.parse(req.body);
    const account = await getAccountByRiotId(riotId);

    const player = await prisma.player.update({
      where: { id: playerId },
      data: {
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid,
      },
      select: { id: true, name: true, riotId: true },
    });

    res.json({ success: true, data: player });
  })
);

/**
 * GET /api/riot/live/:playerId
 * Captura o Match ID enquanto o custom esta rolando. E o unico caminho
 * automatico: o historico por PUUID nao lista custom games.
 */
riotRouter.get(
  '/live/:playerId',
  asyncHandler(async (req, res) => {
    const player = await prisma.player.findUnique({
      where: { id: req.params.playerId },
      select: { puuid: true, name: true },
    });

    if (!player?.puuid) {
      res.status(400).json({
        success: false,
        error: 'Esse jogador ainda não tem o Riot ID vinculado.',
        code: 'PUUID_MISSING',
      });
      return;
    }

    const matchId = await captureLiveMatchId(player.puuid);
    res.json({
      success: true,
      data: { matchId, inGame: matchId !== null, player: player.name },
    });
  })
);

/**
 * Casa os participantes da Riot com os jogadores cadastrados, pelo PUUID.
 * Devolve tambem quem nao bateu, para a UI pedir o vinculo em vez de silenciar.
 */
async function mapParticipantsToPlayers(imported: ImportedMatch) {
  const puuids = imported.participants.map((p) => p.puuid);
  const known = await prisma.player.findMany({
    where: { puuid: { in: puuids } },
    select: { id: true, puuid: true, name: true },
  });

  const byPuuid = new Map(known.map((player) => [player.puuid as string, player]));

  const matched: MatchPlayerInput[] = [];
  const unmatched: { puuid: string; riotId: string | null; championName: string }[] = [];

  for (const participant of imported.participants) {
    const player = byPuuid.get(participant.puuid);
    if (!player) {
      unmatched.push({
        puuid: participant.puuid,
        riotId: participant.riotId,
        championName: participant.championName,
      });
      continue;
    }

    matched.push({
      playerId: player.id,
      teamSide: participant.teamSide,
      rolePlayed: participant.rolePlayed,
      championName: participant.championName,
      championId: participant.championId,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      damage: participant.damage,
      damageTaken: participant.damageTaken,
      goldEarned: participant.goldEarned,
      visionScore: participant.visionScore,
      cs: participant.cs,
    });
  }

  return { matched, unmatched };
}

const importSchema = z.object({
  matchId: z.string().min(3),
  seriesId: z.string().min(1),
  matchNumber: z.number().int().min(1).max(3).optional(),
  /**
   * Preview: busca e devolve os dados sem gravar, para o usuario conferir as
   * roles (a Riot nem sempre infere posicao em custom game).
   */
  dryRun: z.boolean().optional(),
});

/**
 * POST /api/riot/import
 * Fluxo principal de sincronizacao: recebe o Match ID e grava o jogo na MD3.
 */
riotRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { matchId, seriesId, matchNumber, dryRun } = importSchema.parse(req.body);

    const imported = await fetchMatch(matchId);
    const { matched, unmatched } = await mapParticipantsToPlayers(imported);

    if (unmatched.length > 0) {
      // Nao grava pela metade: uma partida com 8 de 10 jogadores estragaria o
      // leaderboard silenciosamente. Devolve quem falta para o usuario vincular.
      res.status(409).json({
        success: false,
        error: `${unmatched.length} participante(s) da partida não estão vinculados a nenhum jogador cadastrado.`,
        code: 'UNMATCHED_PARTICIPANTS',
        details: { unmatched, preview: imported },
      });
      return;
    }

    if (dryRun) {
      res.json({
        success: true,
        data: { preview: { ...imported, players: matched }, saved: false },
      });
      return;
    }

    const result = await recordMatch({
      seriesId,
      matchNumber,
      winner: imported.winner,
      gameDurationSec: imported.gameDurationSec,
      riotMatchId: imported.riotMatchId,
      source: 'RIOT_API',
      players: matched,
    });

    res.status(201).json({
      success: true,
      data: { ...result, saved: true, isCustomGame: imported.isCustomGame },
    });
  })
);

/**
 * POST /api/riot/sync-last
 * O botao "Sincronizar Ultima Partida". Tenta capturar o jogo ao vivo pelo
 * spectator de qualquer jogador vinculado da serie.
 *
 * Se ninguem estiver em partida, responde 404 com instrucao clara -- e nao um
 * erro generico -- porque essa e a limitacao conhecida da API para customs.
 */
riotRouter.post(
  '/sync-last',
  asyncHandler(async (req, res) => {
    const { seriesId } = z.object({ seriesId: z.string().min(1) }).parse(req.body);

    const linked = await prisma.player.findMany({
      where: { puuid: { not: null }, active: true },
      select: { id: true, name: true, puuid: true },
      take: 10,
    });

    if (linked.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Nenhum jogador tem Riot ID vinculado. Vincule ao menos um em Jogadores.',
        code: 'NO_LINKED_PLAYERS',
      });
      return;
    }

    for (const player of linked) {
      try {
        const matchId = await captureLiveMatchId(player.puuid as string);
        if (matchId) {
          res.json({
            success: true,
            data: {
              matchId,
              detectedVia: player.name,
              seriesId,
              note: 'Partida em andamento detectada. Chame /api/riot/import com esse matchId quando o jogo acabar.',
            },
          });
          return;
        }
      } catch (error) {
        // Rate limit e chave invalida sao problemas globais: nao adianta varrer
        // o resto da lista batendo na mesma parede.
        if (
          error instanceof RiotApiError &&
          (error.code === 'RATE_LIMITED' || error.code === 'INVALID_KEY')
        ) {
          throw error;
        }
      }
    }

    res.status(404).json({
      success: false,
      error:
        'Ninguém está em partida agora. Custom games não aparecem no histórico da Riot: ' +
        'cole o Match ID manualmente ou use o registro manual.',
      code: 'NO_LIVE_GAME',
    });
  })
);
