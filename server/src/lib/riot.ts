/**
 * RIOT GAMES API
 *
 * LIMITACAO IMPORTANTE, LEIA ANTES DE DEBUGAR:
 *
 * Custom Games NAO aparecem em `/lol/match/v5/matches/by-puuid/{puuid}/ids`.
 * Esse endpoint so lista filas oficiais (ranqueada, normal, ARAM...). Ou seja,
 * o botao "Sincronizar Ultima Partida" NAO consegue descobrir sozinho o id de
 * um inhouse varrendo o historico -- nao existe historico de custom por ali.
 *
 * O que funciona:
 *   - `/lol/match/v5/matches/{matchId}` COM o id em maos devolve o custom game
 *     normalmente (queueId 0, gameType CUSTOM_GAME).
 *   - `/lol/spectator/v5/active-games/by-summoner/{puuid}` enxerga a partida
 *     enquanto ela esta rolando, e de la sai o gameId. Guardando esse gameId
 *     durante o jogo, da pra buscar o resultado completo depois que acabar.
 *
 * Por isso o fluxo do produto e:
 *   1. (melhor) durante o jogo, `captureLiveMatchId` guarda o id via spectator;
 *   2. (bom) o usuario cola o Match ID e a gente busca por id;
 *   3. (sempre disponivel) formulario manual, que nao depende da Riot.
 *
 * Chave de desenvolvimento expira a cada 24h. Sem RIOT_API_KEY o modulo inteiro
 * responde `RIOT_DISABLED` e o app cai no modo manual sem quebrar.
 */

import { env, hasRiotApi } from './env.js';
import { normalizeRole, type Role } from './roles.js';

const ACCOUNT_ROUTE = () => `https://${env.riotRegionalRoute}.api.riotgames.com`;
const PLATFORM_ROUTE = () => `https://${env.riotPlatform}.api.riotgames.com`;

export class RiotApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'RiotApiError';
  }
}

function assertEnabled(): void {
  if (!hasRiotApi) {
    throw new RiotApiError(
      'RIOT_API_KEY não configurada. Use o registro manual de partida.',
      'RIOT_DISABLED'
    );
  }
}

/**
 * Wrapper unico de request: injeta o header, traduz status HTTP em erro
 * tipado e respeita o Retry-After do rate limit.
 */
async function riotFetch<T>(url: string): Promise<T> {
  assertEnabled();

  const response = await fetch(url, {
    headers: { 'X-Riot-Token': env.riotApiKey as string },
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  if (response.status === 404) {
    throw new RiotApiError('Recurso não encontrado na Riot API.', 'NOT_FOUND', 404);
  }
  if (response.status === 401 || response.status === 403) {
    throw new RiotApiError(
      'Chave da Riot inválida ou expirada (chaves de desenvolvimento duram 24h).',
      'INVALID_KEY',
      response.status
    );
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? '10');
    throw new RiotApiError(
      `Rate limit da Riot atingido. Tente de novo em ${retryAfter}s.`,
      'RATE_LIMITED',
      429,
      retryAfter
    );
  }

  throw new RiotApiError(
    `Riot API respondeu HTTP ${response.status}.`,
    'UPSTREAM_ERROR',
    response.status
  );
}

// ---------------------------------------------------------------------------
// Account-V1: Riot ID -> PUUID
// ---------------------------------------------------------------------------

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** Divide "Nick#BR1" em nome e tag. */
export function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const [gameName, tagLine] = riotId.split('#');
  if (!gameName || !tagLine) {
    throw new RiotApiError(
      `Riot ID inválido: "${riotId}". Formato esperado: Nick#TAG.`,
      'INVALID_RIOT_ID'
    );
  }
  return { gameName: gameName.trim(), tagLine: tagLine.trim() };
}

export async function getAccountByRiotId(riotId: string): Promise<RiotAccount> {
  const { gameName, tagLine } = parseRiotId(riotId);
  const url =
    `${ACCOUNT_ROUTE()}/riot/account/v1/accounts/by-riot-id/` +
    `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<RiotAccount>(url);
}

// ---------------------------------------------------------------------------
// Summoner-V4: icone de invocador (usado pela conta do jogador, issue #3)
// ---------------------------------------------------------------------------

interface SummonerDto {
  profileIconId: number;
}

export async function getSummonerByPuuid(puuid: string): Promise<{ profileIconId: number }> {
  const dto = await riotFetch<SummonerDto>(
    `${PLATFORM_ROUTE()}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`
  );
  return { profileIconId: dto.profileIconId };
}

// ---------------------------------------------------------------------------
// Spectator-V5: capturar o id enquanto o custom esta em andamento
// ---------------------------------------------------------------------------

interface SpectatorGame {
  gameId: number;
  platformId: string;
  gameQueueConfigId?: number;
}

/**
 * Se o jogador estiver numa partida agora, devolve o matchId no formato do
 * match-v5 ("BR1_1234567890"). E o unico jeito automatico de descobrir o id de
 * um custom game.
 */
export async function captureLiveMatchId(puuid: string): Promise<string | null> {
  try {
    const game = await riotFetch<SpectatorGame>(
      `${PLATFORM_ROUTE()}/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`
    );
    return `${game.platformId}_${game.gameId}`;
  } catch (error) {
    // 404 = simplesmente nao esta em jogo. Nao e erro do ponto de vista do app.
    if (error instanceof RiotApiError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Match-V5: buscar a partida completa
// ---------------------------------------------------------------------------

interface RiotParticipant {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  championId: number;
  championName: string;
  teamId: number; // 100 = azul, 200 = vermelho
  teamPosition: string; // TOP JUNGLE MIDDLE BOTTOM UTILITY ('' quando a Riot nao infere)
  individualPosition: string;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  visionScore: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  win: boolean;
}

interface RiotMatchDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameMode: string;
    gameType: string;
    queueId: number;
    participants: RiotParticipant[];
    teams: { teamId: number; win: boolean }[];
  };
}

export interface ImportedParticipant {
  puuid: string;
  riotId: string | null;
  teamSide: 'BLUE' | 'RED';
  rolePlayed: Role;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damageTaken: number;
  goldEarned: number;
  visionScore: number;
  cs: number;
  win: boolean;
}

export interface ImportedMatch {
  riotMatchId: string;
  playedAt: Date;
  gameDurationSec: number;
  isCustomGame: boolean;
  winner: 'BLUE' | 'RED';
  participants: ImportedParticipant[];
}

/**
 * A Riot nem sempre preenche `teamPosition` em custom game (fica string vazia
 * quando o algoritmo dela nao consegue inferir). Ai caimos no
 * `individualPosition`, e se nem isso vier, devolvemos null para a UI pedir a
 * role na mao em vez de chutar errado.
 */
function resolveRole(participant: RiotParticipant): Role | null {
  const raw = participant.teamPosition || participant.individualPosition;
  if (!raw || raw === 'Invalid') return null;
  try {
    const role = normalizeRole(raw);
    return role === 'FILL' ? null : role;
  } catch {
    return null;
  }
}

export async function fetchMatch(matchId: string): Promise<ImportedMatch> {
  const dto = await riotFetch<RiotMatchDto>(
    `${ACCOUNT_ROUTE()}/lol/match/v5/matches/${encodeURIComponent(matchId)}`
  );

  const winningTeamId = dto.info.teams.find((team) => team.win)?.teamId ?? 100;

  const participants: ImportedParticipant[] = dto.info.participants.map((p) => {
    const role = resolveRole(p);
    return {
      puuid: p.puuid,
      riotId: p.riotIdGameName && p.riotIdTagline ? `${p.riotIdGameName}#${p.riotIdTagline}` : null,
      teamSide: p.teamId === 100 ? 'BLUE' : 'RED',
      // Se a Riot nao inferiu, marca TOP e deixa a UI corrigir. O campo
      // `rolePlayed` e obrigatorio no banco; a tela de revisao existe pra isso.
      rolePlayed: role ?? 'TOP',
      championName: p.championName,
      championId: p.championId,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      damage: p.totalDamageDealtToChampions,
      damageTaken: p.totalDamageTaken,
      goldEarned: p.goldEarned,
      visionScore: p.visionScore,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      win: p.win,
    };
  });

  return {
    riotMatchId: dto.metadata.matchId,
    playedAt: new Date(dto.info.gameCreation),
    gameDurationSec: dto.info.gameDuration,
    isCustomGame: dto.info.gameType === 'CUSTOM_GAME' || dto.info.queueId === 0,
    winner: winningTeamId === 100 ? 'BLUE' : 'RED',
    participants,
  };
}
