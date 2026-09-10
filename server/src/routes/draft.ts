import { Router } from 'express';
import { z } from 'zod';
import { autoBalanceTeams, DraftError } from '../lib/autoBalance.js';
import {
  applyPick,
  buildPickOrder,
  finalizeCaptainsDraft,
  selectCaptains,
  startCaptainsDraft,
  type CaptainCandidate,
} from '../lib/captainsDraft.js';
import { findPlayersByIds, toDraftablePlayer } from '../services/players.js';
import { getLastGameLosers } from '../services/series.js';
import { getWinRates } from '../services/stats.js';
import {
  buscarSala,
  criarSala,
  escolherNaSala,
  liberarLado,
  pegarLado,
} from '../services/draftRooms.js';
import { asyncHandler } from './helpers.js';

export const draftRouter = Router();

const rosterSchema = z.array(z.string().min(1)).length(10, 'Selecione exatamente 10 jogadores');

/**
 * Carrega os 10 jogadores e garante que todos os ids existem -- senao o draft
 * rodaria com 9 e daria um erro confuso la na frente.
 */
async function loadRoster(playerIds: string[]) {
  const players = await findPlayersByIds(playerIds);
  if (players.length !== playerIds.length) {
    const found = new Set(players.map((p) => p.id));
    const missing = playerIds.filter((id) => !found.has(id));
    throw new DraftError(
      `Jogador(es) não encontrado(s): ${missing.join(', ')}.`,
      'PLAYER_NOT_FOUND',
      { missing }
    );
  }
  return players;
}

const autoBalanceSchema = z.object({
  playerIds: rosterSchema,
  /** Repassar a seed de um sorteio anterior reproduz exatamente o mesmo resultado. */
  seed: z.number().int().optional(),
  /** Ignora o rating e busca so o melhor encaixe de roles. */
  ignoreRating: z.boolean().optional(),
});

/**
 * POST /api/draft/auto-balance
 * O botao "Sortear Times".
 */
draftRouter.post(
  '/auto-balance',
  asyncHandler(async (req, res) => {
    const { playerIds, seed, ignoreRating } = autoBalanceSchema.parse(req.body);
    const roster = await loadRoster(playerIds);

    const result = autoBalanceTeams(roster.map(toDraftablePlayer), {
      seed,
      ...(ignoreRating ? { ratingWeight: 0 } : {}),
    });

    res.json({ success: true, data: result });
  })
);

const captainsSchema = z.object({
  playerIds: rosterSchema,
  mode: z.enum(['TOP_WINRATE', 'LAST_LOSERS', 'RANDOM']).default('TOP_WINRATE'),
  /** Necessario no modo LAST_LOSERS: de qual MD3 pegar quem perdeu o ultimo mapa. */
  seriesId: z.string().optional(),
  seed: z.number().int().optional(),
});

/**
 * POST /api/draft/captains/start
 * Escolhe os capitaes e devolve o estado inicial + a ordem snake 1-2-2-2-1.
 */
draftRouter.post(
  '/captains/start',
  asyncHandler(async (req, res) => {
    const { playerIds, mode, seriesId, seed } = captainsSchema.parse(req.body);
    const roster = await loadRoster(playerIds);
    const winRates = await getWinRates();

    const candidates: CaptainCandidate[] = roster.map((player) => {
      const stats = winRates.get(player.id);
      return {
        ...toDraftablePlayer(player),
        winRate: stats?.winRate ?? 0,
        gamesPlayed: stats?.games ?? 0,
      };
    });

    const lastGameLosers =
      mode === 'LAST_LOSERS' && seriesId ? await getLastGameLosers(seriesId) : [];

    const captains = selectCaptains({ roster: candidates, mode, lastGameLosers, seed });
    const state = startCaptainsDraft(candidates, captains);

    res.json({
      success: true,
      data: { ...state, pickOrder: buildPickOrder('BLUE') },
    });
  })
);

const pickSchema = z.object({
  /**
   * O estado do draft vive no cliente e volta inteiro a cada pick. Sem sessao
   * no servidor: um F5 na tela nao perde o draft, e nao ha estado orfao.
   */
  state: z.object({
    captains: z.record(z.string(), z.any()),
    available: z.array(z.any()),
    picks: z.record(z.string(), z.array(z.any())),
    onTheClock: z.enum(['BLUE', 'RED']).nullable(),
    pickNumber: z.number().int().min(1),
    finished: z.boolean(),
  }),
  playerId: z.string().min(1),
});

/** POST /api/draft/captains/pick */
draftRouter.post(
  '/captains/pick',
  asyncHandler(async (req, res) => {
    const { state, playerId } = pickSchema.parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = applyPick(state as any, playerId);

    res.json({
      success: true,
      data: {
        ...next,
        // Quando fecha o oitavo pick, ja devolve os times com as roles resolvidas.
        teams: next.finished ? finalizeCaptainsDraft(next) : null,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// SALAS DE DRAFT AO VIVO (issue #6)
//
// O modo Capitaes acima guarda o estado no cliente e serve a uma pessoa. Aqui o
// estado mora no banco sob um codigo curto, e quem abre o link ve o mesmo
// draft.
//
// Nao ha login: quem tem o link escolhe. E o mesmo nivel de confianca do grupo
// no proprio saguao do jogo, e o servidor ainda garante o que importa -- a
// escolha entra no time da VEZ, nunca no outro.
// ---------------------------------------------------------------------------

/** GET /api/draft/rooms/:code?since=<versao> */
draftRouter.get(
  '/rooms/:code',
  asyncHandler(async (req, res) => {
    const sala = await buscarSala(req.params.code);
    if (!sala) {
      res.status(404).json({
        success: false,
        error: 'Sala não encontrada ou expirada.',
        code: 'ROOM_NOT_FOUND',
      });
      return;
    }

    // Consulta barata: o cliente manda a versao que ja tem e recebe so um
    // "nao mudou". Isso e o que torna aceitavel consultar de 2 em 2 segundos.
    const since = Number(req.query.since);
    if (Number.isFinite(since) && since === sala.version) {
      res.json({ success: true, data: { unchanged: true, version: sala.version } });
      return;
    }

    res.json({ success: true, data: sala });
  })
);

/**
 * POST /api/draft/rooms
 * Sorteia os capitaes e abre a sala. Devolve o codigo que vira link.
 */
draftRouter.post(
  '/rooms',
  asyncHandler(async (req, res) => {
    const { playerIds, mode, seriesId, seed } = captainsSchema.parse(req.body);
    const roster = await loadRoster(playerIds);
    const winRates = await getWinRates();

    const candidates: CaptainCandidate[] = roster.map((player) => {
      const stats = winRates.get(player.id);
      return {
        ...toDraftablePlayer(player),
        winRate: stats?.winRate ?? 0,
        gamesPlayed: stats?.games ?? 0,
      };
    });

    const lastGameLosers =
      mode === 'LAST_LOSERS' && seriesId ? await getLastGameLosers(seriesId) : [];

    const captains = selectCaptains({ roster: candidates, mode, lastGameLosers, seed });
    const sala = await criarSala(startCaptainsDraft(candidates, captains));

    res.status(201).json({
      success: true,
      data: { ...sala, pickOrder: buildPickOrder('BLUE') },
    });
  })
);

/** POST /api/draft/rooms/:code/pick */
draftRouter.post(
  '/rooms/:code/pick',
  asyncHandler(async (req, res) => {
    const { playerId, version, token } = z
      .object({
        playerId: z.string().min(1),
        version: z.number().int().min(0),
        /** Segredo de quem pegou o lado. Ausente = so vale se o lado esta livre. */
        token: z.string().optional(),
      })
      .parse(req.body);

    res.json({
      success: true,
      data: await escolherNaSala(req.params.code, playerId, version, token),
    });
  })
);

const ladoSchema = z.object({ side: z.enum(['BLUE', 'RED']) });

/**
 * POST /api/draft/rooms/:code/claim
 * Pega um lado. Devolve o segredo que o navegador do capitao guarda.
 */
draftRouter.post(
  '/rooms/:code/claim',
  asyncHandler(async (req, res) => {
    const { side } = ladoSchema.parse(req.body);
    res.json({ success: true, data: await pegarLado(req.params.code, side) });
  })
);

/**
 * POST /api/draft/rooms/:code/release
 * Libera um lado. Qualquer um pode -- a trava e contra acidente, nao contra
 * gente; ficar travado porque o celular do capitao morreu seria pior.
 */
draftRouter.post(
  '/rooms/:code/release',
  asyncHandler(async (req, res) => {
    const { side } = ladoSchema.parse(req.body);
    res.json({ success: true, data: await liberarLado(req.params.code, side) });
  })
);
