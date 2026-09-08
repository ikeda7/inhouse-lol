import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { mapLcuGame, type LcuGame } from '../lib/lcu.js';
import { roflToLcuGame, type RoflMetadata } from '../lib/rofl.js';
import { resolveChampion } from '../lib/ddragon.js';
import {
  recordMatch,
  refreshMatchStats,
  SeriesError,
  type MatchBanInput,
  type MatchPlayerInput,
} from '../services/series.js';
import type { DraftablePlayer } from '../lib/autoBalance.js';
import type { RoleInput, TeamSide } from '../lib/roles.js';
import { asyncHandler } from './helpers.js';

/**
 * Porta de entrada do agente local (`companion/`).
 *
 * Duas origens, um so caminho de gravacao:
 *   - POST /lcu   -> historico do cliente do LoL (~100 partidas, ~1 mes)
 *   - POST /rofl  -> arquivo de replay (partidas antigas, sem limite de janela)
 *
 * O `.rofl` e convertido para o mesmo shape do LCU antes de entrar, entao toda
 * a regra (casamento por PUUID, auto-vinculo, Fearless, idempotencia) vive num
 * lugar so.
 *
 * A traducao acontece no servidor de proposito: o agente continua sendo um
 * script sem dependencias que ninguem precisa atualizar quando a regra muda.
 */
export const ingestRouter = Router();

/**
 * O shape do LCU e grande e varia entre patches. Validamos apenas o que
 * realmente lemos e deixamos o resto passar (`passthrough`), senao cada patch
 * novo quebraria a ingestao por um campo cosmetico.
 */
const lcuGameSchema = z
  .object({
    gameId: z.number(),
    platformId: z.string().optional(),
    gameCreation: z.number().optional(),
    gameCreationDate: z.string().optional(),
    gameDuration: z.number().optional(),
    gameType: z.string().optional(),
    gameMode: z.string().optional(),
    queueId: z.number().optional(),
    mapId: z.number().optional(),
    participants: z.array(z.object({}).passthrough()).optional(),
    participantIdentities: z.array(z.object({}).passthrough()).optional(),
    teams: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

const commonOptions = {
  /** Sem seriesId, cai na MD3 em andamento. */
  seriesId: z.string().optional(),
  matchNumber: z.number().int().min(1).max(3).optional(),
  /** Só devolve o preview, não grava. */
  dryRun: z.boolean().optional(),
  /**
   * Vincula automaticamente participantes desconhecidos cujo Riot ID bata com
   * um cadastro que ainda nao tem PUUID. Evita configuracao manual dos 10.
   */
  autoLink: z.boolean().optional().default(true),
  /**
   * Cria automaticamente quem nao esta cadastrado, usando o nick do Riot ID
   * como nome provisorio.
   *
   * Existe para o caso "quero importar o historico e nao sei de quem e esse
   * nick". Sem isso, um unico desconhecido impede a partida inteira de entrar.
   * Como a identidade de verdade e o PUUID, renomear depois pela tela de
   * Jogadores conserta o rotulo sem mexer em nenhuma estatistica.
   *
   * Fica desligado por padrao: numa noite normal, participante desconhecido
   * costuma ser erro de vinculo, e ai avisar e melhor que inventar gente.
   */
  autoCreatePlayers: z.boolean().optional().default(false),
  /**
   * Quando a partida ja existe, reescreve a scoreboard em vez de so avisar.
   *
   * Serve para preencher coluna nova (destaques) ou corrigir role depois de
   * melhorar a inferencia, sem apagar a partida -- apagar levaria com ela o
   * placar da MD3 e os campeoes queimados.
   */
  refreshStats: z.boolean().optional().default(false),
};

const lcuIngestSchema = z.object({ game: lcuGameSchema, ...commonOptions });

const roflIngestSchema = z.object({
  /** Bloco de metadados extraido do .rofl pelo agente. */
  metadata: z
    .object({
      gameLength: z.number().optional(),
      statsJson: z.string(),
    })
    .passthrough(),
  /** Vem do nome do arquivo: BR1-3019927113.rofl */
  platformId: z.string().min(2),
  gameId: z.number(),
  /** mtime do arquivo -- o replay nao guarda a data da partida. */
  playedAtMs: z.number().optional(),
  ...commonOptions,
});

/**
 * Resolve o nome dos campeoes banidos.
 *
 * O payload traz so o championId. Guardamos o nome junto porque o Data Dragon
 * muda de versao e um id que hoje resolve pode nao resolver depois -- e um ban
 * sem nome na tela nao serve para nada. Se o CDN estiver fora, entra sem nome
 * em vez de derrubar a importacao inteira por um dado decorativo.
 */
async function nomearBans(
  bans: { teamSide: TeamSide; championId: number; pickTurn: number }[]
): Promise<MatchBanInput[]> {
  return Promise.all(
    bans.map(async (ban) => {
      const asset = await resolveChampion(ban.championId).catch(() => null);
      return { ...ban, championName: asset?.name ?? null };
    })
  );
}

/** Carrega o cadastro indexado por PUUID e por Riot ID (para o auto-vinculo). */
async function loadKnownPlayers() {
  const players = await prisma.player.findMany({
    include: { roles: { orderBy: { priority: 'asc' } } },
  });

  const byPuuid = new Map<string, DraftablePlayer>();
  const byRiotId = new Map<string, { id: string; name: string; puuid: string | null }>();

  for (const player of players) {
    const draftable: DraftablePlayer = {
      id: player.id,
      name: player.name,
      roles: player.roles.map((entry) => entry.role as RoleInput),
      rating: player.internalRating,
    };
    if (player.puuid) byPuuid.set(player.puuid, draftable);
    if (player.riotId) {
      byRiotId.set(player.riotId.toLowerCase(), {
        id: player.id,
        name: player.name,
        puuid: player.puuid,
      });
    }
  }

  return { players, byPuuid, byRiotId };
}

interface IngestOptions {
  seriesId?: string;
  matchNumber?: number;
  dryRun?: boolean;
  autoLink: boolean;
  autoCreatePlayers?: boolean;
  refreshStats?: boolean;
  /** Rotulo da origem, so para a resposta. */
  source: 'LCU' | 'ROFL';
}

/**
 * Fluxo unico de ingestao. Recebe o jogo ja no shape do LCU, venha ele do
 * cliente ou de um replay.
 */
async function ingestGame(game: LcuGame, options: IngestOptions, res: Response): Promise<void> {
  const { byPuuid, byRiotId } = await loadKnownPlayers();
  const imported = mapLcuGame(game, byPuuid);

  if (!imported.isCustomGame) {
    res.status(400).json({
      success: false,
      error: 'Essa partida nao e um custom game. O InHouse so registra os amistosos do grupo.',
      code: 'NOT_A_CUSTOM_GAME',
    });
    return;
  }

  // --- auto-vinculo: quem ja tem Riot ID cadastrado ganha o PUUID de brinde ---
  const linked: string[] = [];
  if (options.autoLink) {
    for (const participant of imported.participants) {
      if (!participant.puuid || byPuuid.has(participant.puuid)) continue;
      const candidate = participant.riotId
        ? byRiotId.get(participant.riotId.toLowerCase())
        : undefined;
      if (candidate && !candidate.puuid) {
        await prisma.player.update({
          where: { id: candidate.id },
          data: { puuid: participant.puuid },
        });
        linked.push(candidate.name);
      }
    }
  }

  // --- cria os desconhecidos, quando pedido ---
  const created: string[] = [];
  if (options.autoCreatePlayers) {
    for (const participant of imported.participants) {
      if (!participant.puuid || byPuuid.has(participant.puuid)) continue;

      // Nome provisorio = nick do Riot ID. Fica obvio na tela que precisa
      // renomear, e a unicidade vem do proprio nick.
      const nome =
        participant.riotId?.split('#')[0]?.trim() ||
        participant.summonerName?.trim() ||
        `Jogador ${participant.puuid.slice(0, 6)}`;

      const jaExiste = await prisma.player.findFirst({
        where: { OR: [{ name: nome }, { puuid: participant.puuid }] },
        select: { id: true },
      });
      if (jaExiste) {
        // Nome batido mas PUUID novo: liga os dois em vez de duplicar a pessoa.
        await prisma.player.update({
          where: { id: jaExiste.id },
          data: { puuid: participant.puuid },
        });
        continue;
      }

      await prisma.player.create({
        data: {
          name: nome,
          riotId: participant.riotId,
          puuid: participant.puuid,
          // Sem saber o pool real, FILL e o palpite honesto: nao inventa
          // preferencia que a pessoa nunca declarou.
          roles: { create: [{ role: 'FILL', priority: 0 }] },
        },
      });
      created.push(nome);
    }
  }

  // Recarrega se algo mudou, para o casamento abaixo enxergar os novos vinculos.
  const known =
    linked.length > 0 || created.length > 0 ? (await loadKnownPlayers()).byPuuid : byPuuid;

  const matched: MatchPlayerInput[] = [];
  const unmatched: {
    riotId: string | null;
    summonerName: string | null;
    championName: string | null;
  }[] = [];

  for (const participant of imported.participants) {
    const player = participant.puuid ? known.get(participant.puuid) : undefined;

    // O .rofl traz o NOME do campeao; o LCU traz o id numerico. resolveChampion
    // aceita os dois, entao passamos o que a origem tiver.
    const championKey = participant.championName || participant.championId;
    const champion = await resolveChampion(championKey).catch(() => null);

    if (!player) {
      unmatched.push({
        riotId: participant.riotId,
        summonerName: participant.summonerName,
        championName: champion?.name ?? participant.championName,
      });
      continue;
    }

    // Espalhar em vez de listar campo por campo: os nomes de LcuImportedParticipant
    // e MatchPlayerInput sao os mesmos de proposito, e com 40+ colunas de
    // scoreboard uma lista manual esquece uma e grava zero sem avisar. Só o que
    // muda de verdade vem sobrescrito abaixo -- e o TypeScript reclama se um
    // campo obrigatorio faltar.
    const { puuid, riotId, summonerName, win, ...scoreboard } = participant;

    matched.push({
      ...scoreboard,
      playerId: player.id,
      // Sem o Data Dragon, guarda o que tiver para nao perder o dado.
      championName:
        champion?.name ?? participant.championName ?? `champion:${participant.championId}`,
      // O replay nao traz id numerico (championId = 0); o Data Dragon devolve.
      championId: champion?.key ?? participant.championId ?? null,
    });
  }

  if (unmatched.length > 0) {
    // Gravar 8 de 10 corromperia o leaderboard em silencio. Melhor recusar e
    // dizer exatamente quem falta vincular.
    res.status(409).json({
      success: false,
      error:
        `${unmatched.length} participante(s) nao estao vinculados a nenhum jogador cadastrado.` +
        ` Se nao souber de quem sao, importe com autoCreatePlayers para cadastra-los com o nick e renomear depois.`,
      code: 'UNMATCHED_PARTICIPANTS',
      details: { unmatched, autoLinked: linked },
    });
    return;
  }

  // --- idempotencia: o agente pode reenviar o mesmo jogo sem duplicar ---
  //
  // Esta checagem vem ANTES de procurar a serie de destino de proposito: uma
  // partida que ja existe pertence a uma serie, e exigir uma MD3 aberta para
  // atualizar a scoreboard dela nao faz sentido nenhum. Na ordem contraria, o
  // --refresh-all falhava em todas as partidas fora de uma noite de jogos.
  const already = await prisma.match.findUnique({
    where: { riotMatchId: imported.riotMatchId },
    select: { id: true, matchNumber: true, seriesId: true },
  });
  if (already) {
    // Reenviar o mesmo jogo com refreshStats atualiza a scoreboard no lugar --
    // caminho para preencher colunas novas (destaques) e corrigir roles sem
    // apagar a partida e perder placar da MD3 e campeoes queimados.
    if (options.refreshStats && !options.dryRun) {
      try {
        const { updated, teams, bans } = await refreshMatchStats(
          already.id,
          imported.winner,
          matched,
          {
            teams: imported.teams,
            bans: await nomearBans(imported.bans),
            gameVersion: imported.gameVersion,
            surrendered: imported.surrendered,
          }
        );
        res.json({
          success: true,
          data: {
            saved: true,
            refreshed: true,
            match: already,
            message:
              `Estatisticas do jogo ${already.matchNumber} atualizadas: ${updated} jogadores` +
              `, ${teams} time(s), ${bans} ban(s).`,
          },
        });
      } catch (erro) {
        if (!(erro instanceof SeriesError)) throw erro;
        res.status(409).json({ success: false, error: erro.message, code: erro.code });
      }
      return;
    }

    res.json({
      success: true,
      data: {
        saved: false,
        alreadyImported: true,
        match: already,
        message:
          `A partida ${imported.riotMatchId} ja tinha sido registrada (jogo ${already.matchNumber}).` +
          ' Use refreshStats para reescrever a scoreboard com os dados atuais.',
      },
    });
    return;
  }

  // refreshStats atualiza o que existe, e SO isso. Sem esta guarda, varrer o
  // historico do cliente para consertar as partidas registradas importaria de
  // carona todo custom antigo que aparecesse no caminho -- e todos cairiam na
  // MD3 em andamento, que nao tem nada a ver com eles.
  if (options.refreshStats) {
    res.json({
      success: true,
      data: {
        saved: false,
        skipped: true,
        message: `A partida ${imported.riotMatchId} nao esta registrada. refreshStats so atualiza partida existente.`,
      },
    });
    return;
  }

  // --- serie de destino: so a partir daqui, porque so quem vai GRAVAR precisa ---
  let targetSeriesId = options.seriesId;
  if (!targetSeriesId) {
    const ongoing = await prisma.series.findFirst({
      where: { status: 'ONGOING' },
      orderBy: { date: 'desc' },
    });
    if (!ongoing) {
      res.status(409).json({
        success: false,
        error: 'Nenhuma MD3 em andamento. Abra uma na aba Serie antes de importar.',
        code: 'NO_ONGOING_SERIES',
      });
      return;
    }
    targetSeriesId = ongoing.id;
  }

  if (options.dryRun) {
    res.json({
      success: true,
      data: {
        saved: false,
        source: options.source,
        preview: { ...imported, players: matched },
        rolesFullyInferred: imported.rolesFullyInferred,
        autoLinked: linked,
        autoCreated: created,
        seriesId: targetSeriesId,
      },
    });
    return;
  }

  const result = await recordMatch({
    seriesId: targetSeriesId,
    matchNumber: options.matchNumber,
    winner: imported.winner,
    gameDurationSec: imported.gameDurationSec,
    riotMatchId: imported.riotMatchId,
    source: 'RIOT_API',
    gameVersion: imported.gameVersion,
    surrendered: imported.surrendered,
    players: matched,
    teams: imported.teams,
    bans: await nomearBans(imported.bans),
  });

  res.status(201).json({
    success: true,
    data: {
      saved: true,
      source: options.source,
      autoLinked: linked,
      autoCreated: created,
      // A UI usa isso para pedir conferencia das posicoes quando a origem nao
      // soube inferir todas.
      rolesFullyInferred: imported.rolesFullyInferred,
      match: result.match,
      series: result.series,
    },
  });
}

/**
 * POST /api/ingest/lcu
 * Jogo cru vindo do historico do cliente do LoL.
 */
ingestRouter.post(
  '/lcu',
  asyncHandler(async (req, res) => {
    const { game, ...options } = lcuIngestSchema.parse(req.body);
    await ingestGame(game as unknown as LcuGame, { ...options, source: 'LCU' }, res);
  })
);

/**
 * POST /api/ingest/rofl
 *
 * Metadados extraidos de um arquivo de replay. E o unico caminho para importar
 * partidas que ja sairam da janela do historico do cliente.
 */
ingestRouter.post(
  '/rofl',
  asyncHandler(async (req, res) => {
    const { metadata, platformId, gameId, playedAtMs, ...options } = roflIngestSchema.parse(
      req.body
    );

    const game = roflToLcuGame(metadata as RoflMetadata, { platformId, gameId, playedAtMs });
    await ingestGame(game, { ...options, source: 'ROFL' }, res);
  })
);

/**
 * GET /api/ingest/status
 * O agente bate aqui no boot para confirmar que achou o servidor certo.
 */
ingestRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const [ongoing, linkedCount, totalPlayers] = await Promise.all([
      prisma.series.findFirst({
        where: { status: 'ONGOING' },
        orderBy: { date: 'desc' },
        select: { id: true, name: true, blueScore: true, redScore: true },
      }),
      prisma.player.count({ where: { puuid: { not: null } } }),
      prisma.player.count(),
    ]);

    res.json({
      success: true,
      data: {
        ongoingSeries: ongoing,
        linkedPlayers: linkedCount,
        totalPlayers,
        ready: ongoing !== null,
      },
    });
  })
);
