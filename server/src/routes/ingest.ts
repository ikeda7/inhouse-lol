import { Router } from 'express';
import { z } from 'zod';
import type { LcuGame } from '../lib/lcu.js';
import { roflToLcuGame, type RoflMetadata } from '../lib/rofl.js';
import { ingestGame, statusDaIngestao } from '../services/ingest.js';
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
 * lugar so: `services/ingest.ts`. Aqui fica so o HTTP.
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
 * POST /api/ingest/lcu
 * Jogo cru vindo do historico do cliente do LoL.
 */
ingestRouter.post(
  '/lcu',
  asyncHandler(async (req, res) => {
    const { game, ...options } = lcuIngestSchema.parse(req.body);
    const { criada, data } = await ingestGame(game as unknown as LcuGame, {
      ...options,
      source: 'LCU',
    });
    res.status(criada ? 201 : 200).json({ success: true, data });
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
    const { criada, data } = await ingestGame(game, { ...options, source: 'ROFL' });
    res.status(criada ? 201 : 200).json({ success: true, data });
  })
);

/**
 * GET /api/ingest/status
 * O agente bate aqui no boot para confirmar que achou o servidor certo.
 */
ingestRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await statusDaIngestao() });
  })
);
