/**
 * Cliente HTTP da API.
 *
 * Um wrapper fino em cima do fetch, sem biblioteca de cache: o volume de dados
 * aqui e pequeno e o app tem poucas telas. Se aparecer necessidade de
 * revalidacao automatica, o lugar de trocar por TanStack Query e este arquivo.
 */

import type {
  ApiResponse,
  AutoBalanceResult,
  BuildManifest,
  BurnedChampion,
  CaptainSelectionMode,
  CaptainsDraftState,
  DraftRoom,
  DraftRoomUnchanged,
  ChampionManifest,
  Highlights,
  LeaderboardEntry,
  Player,
  PlayerProfile,
  Role,
  RoleInput,
  SeriesDetail,
  SeriesSummary,
  TeamSide,
} from '../types';

/**
 * Em dev o Vite faz proxy de /api para o backend, entao caminho relativo
 * funciona sem CORS. VITE_API_URL sobrepoe quando front e back estao em hosts
 * diferentes (deploy).
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/** Erro tipado para a UI distinguir "faltou gente pra role" de "caiu a rede". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(
      'Nao consegui falar com o servidor. Ele esta rodando? (npm run dev:server)',
      0,
      'NETWORK_ERROR'
    );
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`Resposta invalida do servidor (HTTP ${response.status}).`, response.status);
  }

  if (!response.ok || !payload.success) {
    throw new ApiError(
      payload.error ?? `Erro HTTP ${response.status}.`,
      response.status,
      payload.code,
      payload.details
    );
  }

  return payload.data as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

// ---------------------------------------------------------------------------
// Jogadores
// ---------------------------------------------------------------------------

export const playersApi = {
  list: (includeInactive = false) =>
    request<Player[]>(`/players?includeInactive=${includeInactive}`),

  get: (id: string) => request<Player>(`/players/${id}`),

  profile: (id: string) => request<PlayerProfile>(`/players/${id}/profile`),

  create: (input: { name: string; roles: RoleInput[]; riotId?: string | null }) =>
    post<Player>('/players', input),

  update: (
    id: string,
    input: Partial<{ name: string; roles: RoleInput[]; riotId: string | null; active: boolean }>
  ) => request<Player>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deactivate: (id: string) => request<Player>(`/players/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export const draftApi = {
  /** O botao "Sortear Times". */
  autoBalance: (playerIds: string[], options: { seed?: number; ignoreRating?: boolean } = {}) =>
    post<AutoBalanceResult>('/draft/auto-balance', { playerIds, ...options }),

  startCaptains: (
    playerIds: string[],
    mode: CaptainSelectionMode = 'TOP_WINRATE',
    seriesId?: string
  ) => post<CaptainsDraftState>('/draft/captains/start', { playerIds, mode, seriesId }),

  pick: (state: CaptainsDraftState, playerId: string) =>
    post<CaptainsDraftState>('/draft/captains/pick', { state, playerId }),

  // --- draft ao vivo (issue #6) ---

  criarSala: (playerIds: string[], mode: CaptainSelectionMode = 'TOP_WINRATE', seriesId?: string) =>
    post<DraftRoom>('/draft/rooms', { playerIds, mode, seriesId }),

  /**
   * Consulta a sala. Mandando `since`, o servidor responde so "nao mudou" --
   * e o que torna aceitavel consultar de poucos em poucos segundos.
   */
  verSala: (code: string, since?: number) =>
    request<DraftRoom | DraftRoomUnchanged>(
      `/draft/rooms/${encodeURIComponent(code)}` + (since === undefined ? '' : `?since=${since}`)
    ),

  escolherNaSala: (code: string, playerId: string, version: number, token?: string) =>
    post<DraftRoom>(`/draft/rooms/${encodeURIComponent(code)}/pick`, { playerId, version, token }),

  pegarLado: (code: string, side: TeamSide) =>
    post<{ sala: DraftRoom; token: string }>(`/draft/rooms/${encodeURIComponent(code)}/claim`, {
      side,
    }),

  liberarLado: (code: string, side: TeamSide) =>
    post<DraftRoom>(`/draft/rooms/${encodeURIComponent(code)}/release`, { side }),
};

// ---------------------------------------------------------------------------
// Series / partidas
// ---------------------------------------------------------------------------

export interface RecordMatchPlayer {
  playerId: string;
  teamSide: TeamSide;
  rolePlayed: Role;
  championName: string;
  championId?: number | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  damage?: number;
  visionScore?: number;
  cs?: number;
}

export const seriesApi = {
  list: (limit = 20) => request<SeriesSummary[]>(`/series?limit=${limit}`),

  current: () => request<SeriesDetail | null>('/series/current'),

  get: (id: string) => request<SeriesDetail>(`/series/${id}`),

  burned: (id: string) => request<BurnedChampion[]>(`/series/${id}/burned`),

  create: (input: { name?: string; fearless?: boolean }) =>
    post<SeriesSummary>('/series', input),

  /** Registro manual -- o fallback quando a Riot API nao ajuda. */
  recordMatch: (
    seriesId: string,
    input: {
      winner: TeamSide;
      matchNumber?: number;
      gameDurationSec?: number;
      players: RecordMatchPlayer[];
    }
  ) => post<unknown>(`/series/${seriesId}/matches`, input),

  finish: (id: string) => post<SeriesSummary>(`/series/${id}/finish`, {}),
};

// ---------------------------------------------------------------------------
// Estatisticas e Riot
// ---------------------------------------------------------------------------

export const statsApi = {
  leaderboard: (sortBy: 'wins' | 'winRate' | 'avgKda' | 'points' = 'wins', minGames = 0) =>
    request<LeaderboardEntry[]>(`/stats/leaderboard?sortBy=${sortBy}&minGames=${minGames}`),

  highlights: () => request<Highlights>('/stats/highlights'),
};

export const riotApi = {
  status: () => request<{ enabled: boolean; note: string }>('/riot/status'),

  champions: () => request<ChampionManifest>('/riot/champions'),

  /** Itens, feiticos e runas -- so o historico precisa, entao vem separado. */
  build: () => request<BuildManifest>('/riot/build'),

  link: (playerId: string, riotId: string) =>
    post<Player>('/riot/link', { playerId, riotId }),

  /** Preview antes de gravar: a Riot as vezes nao infere a role em custom game. */
  importMatch: (matchId: string, seriesId: string, options: { dryRun?: boolean } = {}) =>
    post<unknown>('/riot/import', { matchId, seriesId, ...options }),

  syncLast: (seriesId: string) => post<{ matchId: string }>('/riot/sync-last', { seriesId }),
};
