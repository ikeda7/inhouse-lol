/**
 * Contratos compartilhados com a API.
 *
 * Duplicados de proposito em vez de importados de `server/`: o front nao deve
 * depender do build do back. Se o projeto crescer, a hora de extrair um pacote
 * `shared/` e quando esses tipos comecarem a divergir.
 */

export const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];
export type RoleInput = Role | 'FILL';
export type TeamSide = 'BLUE' | 'RED';

export const ROLE_LABEL: Record<RoleInput, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MID: 'Mid',
  ADC: 'ADC',
  SUPPORT: 'Support',
  FILL: 'Fill',
};

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

export interface Player {
  id: string;
  name: string;
  riotId: string | null;
  roles: RoleInput[];
  internalRating: number;
  active: boolean;
}

export interface AssignedPlayer {
  player: Player;
  role: Role;
  side: TeamSide;
  preferenceIndex: number;
  isAutofill: boolean;
  comfortCost: number;
}

export interface BalancedTeam {
  side: TeamSide;
  slots: Record<Role, AssignedPlayer>;
  players: AssignedPlayer[];
  totalRating: number;
  averageRating: number;
  comfortCost: number;
}

export interface AutoBalanceResult {
  blueTeam: BalancedTeam;
  redTeam: BalancedTeam;
  ratingDiff: number;
  comfortCost: number;
  score: number;
  solutionsEvaluated: number;
  seed: number;
}

export interface BurnedChampion {
  championName: string;
  championId: number | null;
  ddragonId: string | null;
  matchNumberWhenBurned: number;
  teamSide: TeamSide | null;
  player: { id: string; name: string } | null;
}

export interface SeriesSummary {
  id: string;
  name: string | null;
  date: string;
  status: 'ONGOING' | 'FINISHED' | 'CANCELLED';
  winnerTeam: TeamSide | 'NONE' | null;
  scoreline: string;
  blueScore: number;
  redScore: number;
  fearless: boolean;
  matches: { id: string; matchNumber: number; winner: TeamSide | null; gameDurationSec: number | null }[];
  burnedCount: number;
}

export interface MatchStat {
  id: string;
  playerId: string;
  teamSide: TeamSide;
  rolePlayed: Role;
  championName: string;
  championId: number | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  visionScore: number;
  cs: number;
  win: boolean;
  // --- destaques, prontos do cliente do LoL (ver components/Highlights.tsx) ---
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  firstBloodKill: boolean;
  player: { id: string; name: string };
}

export interface SeriesDetail extends Omit<SeriesSummary, 'matches' | 'scoreline' | 'burnedCount'> {
  matches: {
    id: string;
    matchNumber: number;
    winner: TeamSide | null;
    gameDurationSec: number | null;
    playedAt: string;
    source: 'RIOT_API' | 'MANUAL';
    stats: MatchStat[];
  }[];
  burnedChampions: BurnedChampion[];
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  points: number;
  avgKda: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  avgDamagePerMinute: number;
  avgVisionScore: number;
  avgCsPerMinute: number;
  seriesWon: number;
  wonLastSeries: boolean;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  winRate: number;
  avgKda: number;
  avgDamagePerMinute: number;
  avgVisionScore: number;
  byRole: { role: Role; games: number; wins: number; winRate: number; avgKda: number }[];
  championPodium: {
    championName: string;
    ddragonId: string | null;
    games: number;
    wins: number;
    winRate: number;
    avgKda: number;
  }[];
}

export interface ChampionManifest {
  version: string;
  locale: string;
  baseUrl: string;
  champions: { id: string; key: number; name: string; squareUrl: string }[];
}
