/**
 * MODO CAPITAES
 *
 * Alternativa ao auto-balance: dois capitaes escolhem o time na mao, em ordem
 * snake 1-2-2-2-2-1. O sistema so (a) escolhe os capitaes, (b) diz de quem e a
 * vez e (c) no fim distribui as roles dentro de cada time via
 * `assignRolesWithinTeam`.
 *
 * O estado do draft e mantido pelo cliente e revalidado aqui a cada pick, entao
 * nao existe sessao no servidor: cada request manda o estado completo e recebe
 * o proximo. Simples, e sobrevive a F5 na tela do draft.
 */

import {
  assignRolesWithinTeam,
  DraftError,
  NEUTRAL_RATING,
  REQUIRED_PLAYERS,
  type BalancedTeam,
  type DraftablePlayer,
} from './autoBalance.js';
import type { TeamSide } from './roles.js';

/**
 * Ordem snake de escolha: o capitao azul pega 1, o vermelho pega 2, e assim por
 * diante ate o azul fechar com o ultimo. Total: 1+2+2+2+1 = 8 picks para os 8
 * jogadores que sobram depois dos 2 capitaes.
 */
export const SNAKE_PATTERN = [1, 2, 2, 2, 1] as const;

export interface CaptainsPick {
  /** Posicao na fila de escolhas, comecando em 1. */
  order: number;
  side: TeamSide;
}

export interface CaptainsDraftState {
  captains: Record<TeamSide, DraftablePlayer>;
  /** Jogadores ainda no pote. */
  available: DraftablePlayer[];
  picks: Record<TeamSide, DraftablePlayer[]>;
  /** De quem e a vez. Null quando o draft acabou. */
  onTheClock: TeamSide | null;
  pickNumber: number;
  finished: boolean;
}

/** Expande SNAKE_PATTERN em uma fila plana de 8 escolhas. */
export function buildPickOrder(firstPick: TeamSide = 'BLUE'): CaptainsPick[] {
  const other: TeamSide = firstPick === 'BLUE' ? 'RED' : 'BLUE';
  const order: CaptainsPick[] = [];
  let current: TeamSide = firstPick;

  for (const blockSize of SNAKE_PATTERN) {
    for (let i = 0; i < blockSize; i++) {
      order.push({ order: order.length + 1, side: current });
    }
    current = current === firstPick ? other : firstPick;
  }
  return order;
}

export interface CaptainCandidate extends DraftablePlayer {
  /** 0..1. Usado no criterio "os 2 de maior winrate". */
  winRate?: number;
  gamesPlayed?: number;
}

export type CaptainSelectionMode = 'TOP_WINRATE' | 'LAST_LOSERS' | 'RANDOM';

export interface SelectCaptainsInput {
  roster: CaptainCandidate[];
  mode: CaptainSelectionMode;
  /**
   * Para o modo LAST_LOSERS: ids de quem perdeu o ultimo jogo da MD3. O sistema
   * sorteia 2 dessa lista, dando a chance de revanche a quem perdeu.
   */
  lastGameLosers?: string[];
  /** Minimo de jogos para entrar no criterio de winrate. Evita 1-0 = 100%. */
  minGamesForWinrate?: number;
  seed?: number;
}

function pickTwoRandom<T>(items: T[], seed: number): [T, T] {
  // xorshift simples: so precisa ser reproduzivel, nao criptografico.
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const pool = [...items];
  const first = pool.splice(Math.floor(next() * pool.length), 1)[0];
  const second = pool.splice(Math.floor(next() * pool.length), 1)[0];
  return [first, second];
}

/**
 * Escolhe os 2 capitaes.
 *
 * TOP_WINRATE: os dois de maior winrate (com piso de jogos; empate desempata
 * pelo rating interno).
 * LAST_LOSERS: sorteia 2 entre quem perdeu o ultimo mapa.
 * RANDOM: sorteio puro.
 */
export function selectCaptains(input: SelectCaptainsInput): Record<TeamSide, CaptainCandidate> {
  const { roster, mode, lastGameLosers = [], minGamesForWinrate = 3 } = input;
  const seed = input.seed ?? (Math.random() * 0xffffffff) >>> 0;

  if (roster.length !== REQUIRED_PLAYERS) {
    throw new DraftError(
      `O draft de capitaes precisa de ${REQUIRED_PLAYERS} jogadores. Recebi ${roster.length}.`,
      'INVALID_ROSTER_SIZE'
    );
  }

  if (mode === 'LAST_LOSERS') {
    const losers = roster.filter((p) => lastGameLosers.includes(p.id));
    if (losers.length >= 2) {
      const [blue, red] = pickTwoRandom(losers, seed);
      return { BLUE: blue, RED: red };
    }
    // Sem perdedores suficientes presentes (alguem foi embora) -> cai no winrate.
  }

  if (mode === 'RANDOM') {
    const [blue, red] = pickTwoRandom(roster, seed);
    return { BLUE: blue, RED: red };
  }

  const eligible = roster.filter((p) => (p.gamesPlayed ?? 0) >= minGamesForWinrate);
  const pool = eligible.length >= 2 ? eligible : roster;

  const ranked = [...pool].sort((a, b) => {
    const wrDiff = (b.winRate ?? 0) - (a.winRate ?? 0);
    if (Math.abs(wrDiff) > 1e-9) return wrDiff;
    return (b.rating ?? NEUTRAL_RATING) - (a.rating ?? NEUTRAL_RATING);
  });

  return { BLUE: ranked[0], RED: ranked[1] };
}

/** Estado inicial do draft, com os capitaes ja fora do pote. */
export function startCaptainsDraft(
  roster: DraftablePlayer[],
  captains: Record<TeamSide, DraftablePlayer>,
  firstPick: TeamSide = 'BLUE'
): CaptainsDraftState {
  const captainIds = new Set([captains.BLUE.id, captains.RED.id]);
  const available = roster.filter((p) => !captainIds.has(p.id));

  return {
    captains,
    available,
    picks: { BLUE: [captains.BLUE], RED: [captains.RED] },
    onTheClock: firstPick,
    pickNumber: 1,
    finished: false,
  };
}

/** Aplica uma escolha e devolve o novo estado (nao muta o anterior). */
export function applyPick(
  state: CaptainsDraftState,
  playerId: string,
  firstPick: TeamSide = 'BLUE'
): CaptainsDraftState {
  if (state.finished) {
    throw new DraftError('O draft ja terminou.', 'DRAFT_FINISHED');
  }

  const order = buildPickOrder(firstPick);
  const currentPick = order[state.pickNumber - 1];
  if (!currentPick) {
    throw new DraftError('Nao ha mais escolhas nesse draft.', 'DRAFT_FINISHED');
  }

  const chosen = state.available.find((p) => p.id === playerId);
  if (!chosen) {
    throw new DraftError(
      'Esse jogador nao esta disponivel para escolha.',
      'PLAYER_NOT_AVAILABLE',
      { playerId }
    );
  }

  const side = currentPick.side;
  const nextPickNumber = state.pickNumber + 1;
  const nextPick = order[nextPickNumber - 1];

  return {
    captains: state.captains,
    available: state.available.filter((p) => p.id !== playerId),
    picks: {
      ...state.picks,
      [side]: [...state.picks[side], chosen],
    } as Record<TeamSide, DraftablePlayer[]>,
    onTheClock: nextPick ? nextPick.side : null,
    pickNumber: nextPickNumber,
    finished: !nextPick,
  };
}

export interface CaptainsDraftResult {
  blueTeam: BalancedTeam;
  redTeam: BalancedTeam;
}

/**
 * Fecha o draft: com os dois times de 5 definidos, distribui as roles dentro de
 * cada um respeitando o pool declarado.
 */
export function finalizeCaptainsDraft(state: CaptainsDraftState): CaptainsDraftResult {
  if (!state.finished) {
    throw new DraftError(
      `Ainda faltam escolhas (${state.available.length} jogadores no pote).`,
      'DRAFT_INCOMPLETE'
    );
  }

  return {
    blueTeam: assignRolesWithinTeam(state.picks.BLUE, 'BLUE'),
    redTeam: assignRolesWithinTeam(state.picks.RED, 'RED'),
  };
}
