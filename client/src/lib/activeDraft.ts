import type { AutoBalanceResult, Role, TeamSide } from '../types';

/**
 * Times sorteados que estao "em uso" na noite de jogos.
 *
 * Vivem no localStorage, nao no servidor, de proposito: um sorteio ainda nao e
 * um fato do banco -- vira fato quando a partida e registrada. Guardar no
 * servidor criaria estado orfao toda vez que alguem sorteia de novo ou fecha a
 * aba, e exigiria uma tabela `Draft` que nao paga o proprio custo.
 *
 * O efeito pratico e o que importa: sorteia na aba Sorteio, atravessa para a
 * Noite de jogos, e sobrevive a um F5.
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
  const slots = [...result.blueTeam.players, ...result.redTeam.players].map((entry) => ({
    playerId: entry.player.id,
    playerName: entry.player.name,
    teamSide: entry.side,
    rolePlayed: entry.role,
  }));

  return { slots, seed: result.seed, createdAt: new Date().toISOString() };
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
