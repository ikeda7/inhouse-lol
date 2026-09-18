/**
 * Camada de acesso a jogadores.
 *
 * Existe para que as rotas nunca precisem saber que `roles` mora numa tabela
 * separada: aqui dentro a gente traduz `PlayerRole[]` <-> `roles: RoleInput[]`
 * ordenado por preferencia.
 */

import { prisma } from '../db/prisma.js';
import { normalizeRole, type RoleInput } from '../lib/roles.js';
import type { DraftablePlayer } from '../lib/autoBalance.js';

/** Erro de uso do cadastro. `routes/helpers.ts` traduz para HTTP. */
export class PlayerError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'PlayerError';
  }
}

/** Conta extra da Riot: o smurf. A principal fica em `PlayerDTO.riotId`. */
export interface RiotAccountDTO {
  id: string;
  riotId: string | null;
}

export interface PlayerDTO {
  id: string;
  name: string;
  riotId: string | null;
  /** Contas ALEM da principal. Vazio para quem joga de uma conta só. */
  riotAccounts: RiotAccountDTO[];
  /** Ordenado por preferencia: o primeiro e a main. */
  roles: RoleInput[];
  internalRating: number;
  active: boolean;
  /**
   * Se a pessoa já reivindicou a conta (issue #3). É só isso que o público
   * precisa saber: o e-mail fica no AccountDTO, que só o dono recebe.
   */
  hasAccount: boolean;
  photoUrl: string | null;
  photoSource: 'LOL_ICON' | 'UPLOAD' | 'NONE';
}

/**
 * O jogador visto por ele mesmo, logado: o único lugar em que o e-mail sai do
 * servidor.
 *
 * Antes o e-mail vinha no PlayerDTO, e a lista pública de jogadores (GET
 * /api/players, sem login) entregava o e-mail de todo mundo que tinha criado
 * conta -- num site e num repositório públicos.
 */
export interface AccountDTO extends PlayerDTO {
  email: string | null;
}

type PlayerWithRoles = {
  id: string;
  name: string;
  riotId: string | null;
  internalRating: number;
  active: boolean;
  email: string | null;
  passwordHash: string | null;
  photoUrl: string | null;
  photoSource: string;
  roles: { role: string; priority: number }[];
  riotAccounts?: { id: string; riotId: string | null }[];
};

export function toPlayerDTO(player: PlayerWithRoles): PlayerDTO {
  return {
    id: player.id,
    name: player.name,
    riotId: player.riotId,
    riotAccounts: (player.riotAccounts ?? []).map((conta) => ({
      id: conta.id,
      riotId: conta.riotId,
    })),
    roles: [...player.roles]
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.role as RoleInput),
    internalRating: player.internalRating,
    active: player.active,
    // Monta campo a campo em vez de espalhar `player`: um espalhamento levaria
    // junto email e passwordHash sem ninguém perceber.
    hasAccount: player.passwordHash !== null,
    photoUrl: player.photoUrl,
    photoSource: player.photoSource as PlayerDTO['photoSource'],
  };
}

export function toAccountDTO(player: PlayerWithRoles): AccountDTO {
  return { ...toPlayerDTO(player), email: player.email };
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

export const withRoles = {
  roles: { orderBy: { priority: 'asc' as const } },
  riotAccounts: { orderBy: { createdAt: 'asc' as const } },
};

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
 * Liga mais uma conta da Riot ao jogador -- o smurf.
 *
 * O PUUID fica null: ele chega sozinho na primeira partida importada dessa
 * conta, pelo mesmo auto-vinculo da conta principal (services/ingest.ts). Riot
 * ID repetido bate no UNIQUE do banco e vira 409 em routes/helpers.ts, o que
 * tambem impede pendurar no Fulano uma conta que ja e do Beltrano.
 */
export async function addRiotAccount(playerId: string, riotId: string) {
  const conta = riotId.trim();
  const principal = await prisma.player.findUnique({
    where: { id: playerId },
    select: { riotId: true },
  });
  if (!principal) throw new PlayerError('Jogador não encontrado.', 'PLAYER_NOT_FOUND', 404);
  if (principal.riotId?.toLowerCase() === conta.toLowerCase()) {
    throw new PlayerError('Essa já é a conta principal do jogador.', 'CONTA_PRINCIPAL', 409);
  }

  await prisma.riotAccount.create({ data: { playerId, riotId: conta } });
  return (await getPlayerById(playerId))!;
}

/**
 * Desliga uma conta extra. O historico nao se mexe: as partidas ja importadas
 * apontam para o jogador, nao para a conta.
 */
export async function removeRiotAccount(playerId: string, accountId: string) {
  const { count } = await prisma.riotAccount.deleteMany({ where: { id: accountId, playerId } });
  if (count === 0) throw new PlayerError('Conta não encontrada.', 'CONTA_NAO_ENCONTRADA', 404);
  return (await getPlayerById(playerId))!;
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
