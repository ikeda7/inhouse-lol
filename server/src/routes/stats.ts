import { Router } from 'express';
import { z } from 'zod';
import { getLeaderboard } from '../services/stats.js';
import { asyncHandler } from './helpers.js';

export const statsRouter = Router();

const querySchema = z.object({
  sortBy: z.enum(['points', 'winRate', 'avgKda']).default('points'),
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
