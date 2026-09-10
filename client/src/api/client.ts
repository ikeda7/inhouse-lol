/**
 * Cliente HTTP da API.
 *
 * Um wrapper fino em cima do fetch, sem biblioteca de cache: o volume de dados
 * aqui e pequeno e o app tem poucas telas. Se aparecer necessidade de
 * revalidacao automatica, o lugar de trocar por TanStack Query e este arquivo.
 */

import type {
  Account,
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
import { CABECALHO_DA_CHAVE, lerChaveDoGrupo } from '../lib/chaveDoGrupo';

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

  // A chave do grupo vai em todo pedido: o servidor só olha para ela nas
  // escritas, e mandar sempre evita cada tela ter de saber quais são.
  const chave = lerChaveDoGrupo();

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(chave ? { [CABECALHO_DA_CHAVE]: chave } : {}),
      },
      // O cookie de sessao (issue #3) precisa ir e voltar mesmo quando front
      // (:5173) e API (:3333) estao em portas diferentes, em dev.
      credentials: 'include',
      ...init,
    });
  } catch {
    throw new ApiError(
      'Não consegui falar com o servidor. Ele está rodando? (npm run dev:server)',
      0,
      'NETWORK_ERROR'
    );
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`Resposta inválida do servidor (HTTP ${response.status}).`, response.status);
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

  /**
   * Descarta uma série que nunca teve jogo. O servidor recusa se houver
   * partida gravada -- a tela só oferece o botão onde ele vale, mas quem
   * garante é a checagem de lá.
   */
  discard: (id: string) =>
    request<{ id: string; name: string | null }>(`/series/${id}`, {
      method: 'DELETE',
    }),

  burned: (id: string) => request<BurnedChampion[]>(`/series/${id}/burned`),

  create: (input: { name?: string; fearless?: boolean }) => post<SeriesSummary>('/series', input),

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

// ---------------------------------------------------------------------------
// Contas de jogador (issue #3)
// ---------------------------------------------------------------------------

export const authApi = {
  /** Jogadores do elenco que ainda nao tem conta. */
  claimable: () => request<Player[]>('/auth/claimable'),

  register: (input: { playerId: string; email: string; password: string }) =>
    post<Account>('/auth/register', input),

  login: (input: { email: string; password: string }) => post<Account>('/auth/login', input),

  logout: () => post<null>('/auth/logout', {}),

  /** 401 aqui e resposta esperada (visitante deslogado), nao erro de rede. */
  me: () =>
    request<Account>('/auth/me').catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }),
};

export const accountApi = {
  update: (input: Partial<{ name: string; riotId: string | null }>) =>
    request<Account>('/accounts/me', { method: 'PATCH', body: JSON.stringify(input) }),

  /** Resolve `true` no sucesso: a rota nao devolve corpo, e `null` ja e o que
   *  `useAction` retorna quando deu erro -- sem isso os dois casos se confundem. */
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    post<null>('/accounts/me/password', input).then(() => true),

  /** A imagem chega ja redimensionada pelo client (ver lib/imageResize.ts). */
  uploadPhoto: (imageBase64: string) => post<Account>('/accounts/me/photo', { imageBase64 }),

  syncLolPhoto: () => post<Account>('/accounts/me/photo/sync-lol', {}),
};

export const riotApi = {
  status: () => request<{ enabled: boolean; note: string }>('/riot/status'),

  champions: () => request<ChampionManifest>('/riot/champions'),

  /** Itens, feiticos e runas -- so o historico precisa, entao vem separado. */
  build: () => request<BuildManifest>('/riot/build'),

  link: (playerId: string, riotId: string) => post<Player>('/riot/link', { playerId, riotId }),

  /** Preview antes de gravar: a Riot as vezes nao infere a role em custom game. */
  importMatch: (matchId: string, seriesId: string, options: { dryRun?: boolean } = {}) =>
    post<unknown>('/riot/import', { matchId, seriesId, ...options }),

  syncLast: (seriesId: string) => post<{ matchId: string }>('/riot/sync-last', { seriesId }),
};
