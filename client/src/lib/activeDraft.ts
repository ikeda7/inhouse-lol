import type { AutoBalanceResult, BalancedTeam, Role, TeamSide } from '../types';

/**
 * Times sorteados que estao "em uso" na noite de jogos.
 *
 * Vivem no localStorage, nao no servidor, de proposito: um sorteio ainda nao e
 * um fato do banco -- vira fato quando a partida e registrada. Guardar no
 * servidor criaria estado orfao toda vez que alguem sorteia de novo ou fecha a
 * aba, e exigiria uma tabela `Draft` que nao paga o proprio custo.
 *
 * O efeito pratico e o que importa: sorteia (ou draftea) na aba Sorteio,
 * atravessa para a aba Serie, e sobrevive a um F5.
 */

const STORAGE_KEY = 'inhouse-lol:active-draft';

export interface ActiveDraftSlot {
  playerId: string;
  playerName: string;
  teamSide: TeamSide;
  rolePlayed: Role;
}

export interface ActiveDraft {
  slots: ActiveDraftSlot[];
  /** Semente do sorteio, para conseguir reproduzir a composicao depois. */
  seed: number;
  createdAt: string;
}

export function fromAutoBalance(result: AutoBalanceResult): ActiveDraft {
  return {
    slots: paraSlots(result.blueTeam, result.redTeam),
    seed: result.seed,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Times vindos do modo Capitães.
 *
 * `seed` fica em 0 porque não houve sorteio: a composição foi escolhida por
 * gente. Zero é honesto -- inventar uma semente sugeriria que dá para
 * reproduzir o draft, e não dá.
 */
export function fromCaptains(teams: { blueTeam: BalancedTeam; redTeam: BalancedTeam }): ActiveDraft {
  return {
    slots: paraSlots(teams.blueTeam, teams.redTeam),
    seed: 0,
    createdAt: new Date().toISOString(),
  };
}

function paraSlots(blueTeam: BalancedTeam, redTeam: BalancedTeam): ActiveDraftSlot[] {
  return [...blueTeam.players, ...redTeam.players].map((entry) => ({
    playerId: entry.player.id,
    playerName: entry.player.name,
    teamSide: entry.side,
    rolePlayed: entry.role,
  }));
}

export function saveActiveDraft(draft: ActiveDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Modo anonimo ou storage cheio: perder o rascunho e aceitavel, travar nao.
  }
}

export function loadActiveDraft(): ActiveDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ActiveDraft;
    // Valida o formato: um schema antigo no storage nao pode quebrar a tela.
    if (!Array.isArray(parsed.slots) || parsed.slots.length !== 10) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }
}
