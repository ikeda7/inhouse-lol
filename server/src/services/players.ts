/**
 * Camada de acesso a jogadores.
 *
 * Existe para que as rotas nunca precisem saber que `roles` mora numa tabela
 * separada: aqui dentro a gente traduz `PlayerRole[]` <-> `roles: RoleInput[]`
 * ordenado por preferencia.
 */

import { prisma } from '../lib/prisma.js';
import { normalizeRole, type RoleInput } from '../lib/roles.js';
import type { DraftablePlayer } from '../lib/autoBalance.js';

export interface PlayerDTO {
  id: string;
  name: string;
  riotId: string | null;
  /** Ordenado por preferencia: o primeiro e a main. */
  roles: RoleInput[];
  internalRating: number;
  active: boolean;
  /** null = ainda nao reivindicou a conta (issue #3). Nunca expor passwordHash. */
  email: string | null;
  photoUrl: string | null;
  photoSource: 'LOL_ICON' | 'UPLOAD' | 'NONE';
}

type PlayerWithRoles = {
  id: string;
  name: string;
  riotId: string | null;
  internalRating: number;
  active: boolean;
  email: string | null;
  photoUrl: string | null;
  photoSource: string;
  roles: { role: string; priority: number }[];
};

export function toPlayerDTO(player: PlayerWithRoles): PlayerDTO {
  return {
    id: player.id,
    name: player.name,
    riotId: player.riotId,
    roles: [...player.roles]
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.role as RoleInput),
    internalRating: player.internalRating,
    active: player.active,
    email: player.email,
    photoUrl: player.photoUrl,
    photoSource: player.photoSource as PlayerDTO['photoSource'],
  };
}

/** Formato que o algoritmo de draft consome. */
export function toDraftablePlayer(player: PlayerDTO): DraftablePlayer {
  return {
    id: player.id,
    name: player.name,
    roles: player.roles,
    rating: player.internalRating,
  };
}

export const withRoles = { roles: { orderBy: { priority: 'asc' as const } } };

export async function listPlayers(options: { includeInactive?: boolean } = {}) {
  const players = await prisma.player.findMany({
    where: options.includeInactive ? {} : { active: true },
    include: withRoles,
    orderBy: { name: 'asc' },
  });
  return players.map(toPlayerDTO);
}

export async function getPlayerById(id: string) {
  const player = await prisma.player.findUnique({ where: { id }, include: withRoles });
  return player ? toPlayerDTO(player) : null;
}

export async function findPlayersByIds(ids: string[]) {
  const players = await prisma.player.findMany({
    where: { id: { in: ids } },
    include: withRoles,
  });
  return players.map(toPlayerDTO);
}

export interface UpsertPlayerInput {
  name: string;
  roles: string[];
  riotId?: string | null;
  internalRating?: number;
  active?: boolean;
}

export async function createPlayer(input: UpsertPlayerInput) {
  const roles = input.roles.map(normalizeRole);

  const player = await prisma.player.create({
    data: {
      name: input.name.trim(),
      riotId: input.riotId?.trim() || null,
      internalRating: input.internalRating ?? 1000,
      active: input.active ?? true,
      roles: {
        create: roles.map((role, priority) => ({ role, priority })),
      },
    },
    include: withRoles,
  });

  return toPlayerDTO(player);
}

/**
 * Atualiza o jogador. Quando `roles` vem no payload, o pool inteiro e
 * substituido -- e mais previsivel que tentar fazer diff de prioridades, e o
 * volume e de 5 linhas por jogador.
 */
export async function updatePlayer(id: string, input: Partial<UpsertPlayerInput>) {
  const roles = input.roles?.map(normalizeRole);

  const player = await prisma.$transaction(async (tx) => {
    if (roles) {
      await tx.playerRole.deleteMany({ where: { playerId: id } });
      await tx.playerRole.createMany({
        data: roles.map((role, priority) => ({ playerId: id, role, priority })),
      });
    }

    return tx.player.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.riotId !== undefined ? { riotId: input.riotId?.trim() || null } : {}),
        ...(input.internalRating !== undefined ? { internalRating: input.internalRating } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: withRoles,
    });
  });

  return toPlayerDTO(player);
}

/**
 * Desativa em vez de deletar: apagar o jogador levaria junto todo o historico
 * de partidas dele (onDelete: Cascade), e o leaderboard historico ficaria errado.
 */
export async function deactivatePlayer(id: string) {
  const player = await prisma.player.update({
    where: { id },
    data: { active: false },
    include: withRoles,
  });
  return toPlayerDTO(player);
}
