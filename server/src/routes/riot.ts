import { Router } from 'express';
import { z } from 'zod';
import { fetchMatch } from '../lib/riot.js';
import { getChampionManifest } from '../lib/ddragon.js';
import { getBuildManifest } from '../lib/ddragonBuild.js';
import { importarPartidaDaRiot } from '../services/ingest.js';
import { asyncHandler } from './helpers.js';

/**
 * Data Dragon (catálogo de campeões, itens, feitiços e runas) e a importação
 * por Match ID pela API pública da Riot.
 *
 * A captura ao vivo pelo spectator, o vínculo de Riot ID e o /status saíram em
 * 13/09/2026: nenhuma tela chamava, e sem chave em produção só davam 503.
 */
export const riotRouter = Router();

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
 * Recebe o Match ID colado na aba Série e grava o jogo na MD3.
 */
riotRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { matchId, ...opcoes } = importSchema.parse(req.body);
    const { criada, data } = await importarPartidaDaRiot(await fetchMatch(matchId), opcoes);
    res.status(criada ? 201 : 200).json({ success: true, data });
  })
);
