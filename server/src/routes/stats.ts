import { Router } from 'express';
import { z } from 'zod';
import { getLeaderboard } from '../services/stats.js';
import { getDestaques } from '../services/highlights.js';
import { asyncHandler } from './helpers.js';

export const statsRouter = Router();

const querySchema = z.object({
  sortBy: z.enum(['wins', 'winRate', 'avgKda', 'points']).default('wins'),
  minGames: z.coerce.number().int().min(0).default(0),
});

/** GET /api/stats/leaderboard?sortBy=points&minGames=3 */
statsRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const { sortBy, minGames } = querySchema.parse(req.query);
    res.json({ success: true, data: await getLeaderboard({ sortBy, minGames }) });
  })
);

/** GET /api/stats/highlights -- recordes e momentos das noites. */
statsRouter.get(
  '/highlights',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getDestaques() });
  })
);
