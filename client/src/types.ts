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

/** De onde veio a foto do jogador (issue #3). */
export type PhotoSource = 'LOL_ICON' | 'UPLOAD' | 'NONE';

export interface Player {
  id: string;
  name: string;
  riotId: string | null;
  roles: RoleInput[];
  internalRating: number;
  active: boolean;
  /** null = ainda nao reivindicou a conta. */
  email: string | null;
  photoUrl: string | null;
  photoSource: PhotoSource;
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
  damageTaken: number;
  goldEarned: number;
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
  firstBloodAssist: boolean;
  killingSprees: number;
  largestCriticalStrike: number;
  // --- scoreboard completo (ver o modelo MatchPlayerStat no servidor) ---
  champLevel: number;
  goldSpent: number;
  totalDamageDealt: number;
  damageToObjectives: number;
  damageToTurrets: number;
  damageSelfMitigated: number;
  totalHeal: number;
  physicalDamageToChampions: number;
  magicDamageToChampions: number;
  trueDamageToChampions: number;
  timeCCingOthers: number;
  longestTimeSpentLiving: number;
  turretKills: number;
  inhibitorKills: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWardsBought: number;
  laneMinionsKilled: number;
  neutralMinionsKilled: number;
  /** Os 7 slots em CSV. null = a origem nao trouxe build (caso do replay). */
  items: string | null;
  spell1Id: number | null;
  spell2Id: number | null;
  keystoneId: number | null;
  primaryStyleId: number | null;
  subStyleId: number | null;
  player: { id: string; name: string };
}

export interface SeriesDetail extends Omit<SeriesSummary, 'matches' | 'scoreline' | 'burnedCount'> {
  matches: {
    id: string;
    matchNumber: number;
    winner: TeamSide | null;
    gameDurationSec: number | null;
    playedAt: string;
    /** LCU = cliente do LoL · ROFL = replay · MANUAL = digitado na mão. */
    source: 'LCU' | 'ROFL' | 'RIOT_API' | 'MANUAL';
    /** Patch da partida. null nas importadas antes de a coluna existir. */
    gameVersion: string | null;
    surrendered: boolean;
    stats: MatchStat[];
    teams: MatchTeamStat[];
    bans: MatchBan[];
  }[];
  burnedChampions: BurnedChampion[];
}

/** Objetivos de um dos lados da partida. */
export interface MatchTeamStat {
  teamSide: TeamSide;
  win: boolean;
  towerKills: number;
  inhibitorKills: number;
  dragonKills: number;
  baronKills: number;
  riftHeraldKills: number;
  voidgrubKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  firstInhibitor: boolean;
  firstBaron: boolean;
  firstDragon: boolean;
}

export interface MatchBan {
  teamSide: TeamSide;
  championId: number;
  championName: string | null;
  pickTurn: number;
}

/** Itens, feiticos e runas do Data Dragon. Um so por sessao. */
export interface BuildAsset {
  id: number;
  name: string;
  iconUrl: string;
}

export interface BuildManifest {
  version: string;
  items: (BuildAsset & { gold: number })[];
  spells: BuildAsset[];
  runes: BuildAsset[];
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  /** Foto de perfil de quem já reivindicou a conta; null para o resto. */
  photoUrl: string | null;
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
  /** Os três campeões mais jogados, do mais para o menos. */
  topChampions: { championName: string; games: number }[];
  /** Role mais jogada. */
  mainRole: Role | null;
  /** Selo de brincadeira: KDA alto sem contribuição na proporção. */
  isKdaPlayer: boolean;
}

export interface RecentMatch {
  matchId: string;
  matchNumber: number;
  seriesId: string;
  seriesName: string | null;
  playedAt: string;
  gameDurationSec: number | null;
  championName: string;
  ddragonId: string | null;
  rolePlayed: Role;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  cs: number;
  visionScore: number;
  goldEarned: number;
  win: boolean;
  largestMultiKill: number;
  largestKillingSpree: number;
  firstBloodKill: boolean;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  /** Foto de quem já reivindicou a conta; null para o resto. */
  photoUrl: string | null;
  games: number;
  wins: number;
  winRate: number;
  avgKda: number;
  avgDamagePerMinute: number;
  avgVisionScore: number;
  byRole: { role: Role; games: number; wins: number; winRate: number; avgKda: number }[];
  avgCsPerMinute: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  seriesWon: number;
  recentMatches: RecentMatch[];
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

// ---------------------------------------------------------------------------
// Destaques (issue #14)
// ---------------------------------------------------------------------------

/** De onde o destaque veio -- para linkar o jogador e datar o feito. */
export interface HighlightContext {
  playerId: string;
  playerName: string;
  championName: string;
  ddragonId: string | null;
  rolePlayed: Role;
  matchId: string;
  matchNumber: number;
  seriesId: string;
  seriesName: string | null;
  playedAt: string;
}

export interface RecordEntry extends HighlightContext {
  categoria: string;
  valor: number;
  /** Numero ja formatado pelo servidor ("41k", "8.50"). */
  exibicao: string;
}

export type MomentType =
  | 'PENTA'
  | 'QUADRA'
  | 'SPREE'
  | 'SEM_MORRER'
  | 'CARRY'
  | 'MURALHA'
  | 'VISAO'
  | 'FARM'
  | 'FIRST_BLOOD';

export interface MomentEntry extends HighlightContext {
  tipo: MomentType;
  valor: number;
  /** Raridade: ordena os momentos dentro da mesma noite. */
  peso: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

export interface Highlights {
  recordes: RecordEntry[];
  momentos: MomentEntry[];
  partidas: number;
}

// ---------------------------------------------------------------------------
// Modo Capitães (issue #5)
// ---------------------------------------------------------------------------

/** Jogador como o motor de draft o enxerga: só id, nome, pool e rating. */
export interface DraftablePlayer {
  id: string;
  name: string;
  roles: RoleInput[];
  rating: number;
}

export interface CaptainCandidate extends DraftablePlayer {
  /** 0..1. Critério do modo "os 2 de maior winrate". */
  winRate?: number;
  gamesPlayed?: number;
}

/** Uma posição na fila snake 1-2-2-2-1. */
export interface CaptainsPick {
  order: number;
  side: TeamSide;
}

export interface CaptainsDraftState {
  captains: Record<TeamSide, CaptainCandidate>;
  /** Quem ainda está no pote. */
  available: DraftablePlayer[];
  picks: Record<TeamSide, DraftablePlayer[]>;
  /** De quem é a vez. Null quando o draft acabou. */
  onTheClock: TeamSide | null;
  pickNumber: number;
  finished: boolean;
  /** Só vem no /start; o cliente guarda para desenhar a fila. */
  pickOrder?: CaptainsPick[];
  /** Só vem preenchido no pick que fecha o draft. */
  teams?: { blueTeam: BalancedTeam; redTeam: BalancedTeam } | null;
}

export type CaptainSelectionMode = 'TOP_WINRATE' | 'LAST_LOSERS' | 'RANDOM';

/** Sala de draft ao vivo (issue #6). */
export interface DraftRoom {
  code: string;
  version: number;
  /** Quais lados já têm capitão. Os segredos nunca vêm do servidor. */
  claimed: Record<TeamSide, boolean>;
  state: CaptainsDraftState;
  /** Preenchido só quando o draft fecha. */
  teams: { blueTeam: BalancedTeam; redTeam: BalancedTeam } | null;
  expiresAt: string;
  /** Só vem na criação; o cliente guarda para desenhar a fila. */
  pickOrder?: CaptainsPick[];
}

/** Resposta da consulta barata quando nada mudou desde a versão informada. */
export interface DraftRoomUnchanged {
  unchanged: true;
  version: number;
}
