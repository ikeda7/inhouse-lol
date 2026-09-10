/**
 * CONTAS DE JOGADOR (issue #3)
 *
 * "Criar uma conta" aqui e "dar login a um jogador que ja existe" -- nao ha
 * tabela de usuario separada. O jogador ja e a identidade central (dono de
 * MatchPlayerStat, PlayerRole...), entao a conta so preenche email/senha/foto
 * num Player que a aba Jogadores ja cadastrou. Ver ARCHITECTURE.md.
 */

import { prisma } from '../lib/prisma.js';
import { hasRiotApi } from '../lib/env.js';
import {
  hashPassword,
  signSession,
  verifyPassword,
  verifySession,
  versaoDaSenha,
} from '../lib/auth.js';
import { getSummonerByPuuid } from '../lib/riot.js';
import { getProfileIconUrl } from '../lib/ddragon.js';
import {
  toAccountDTO,
  toPlayerDTO,
  withRoles,
  type AccountDTO,
  type PlayerDTO,
} from './players.js';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PLAYER_NOT_FOUND'
      | 'ALREADY_CLAIMED'
      | 'INVALID_CREDENTIALS'
      | 'PHOTO_TOO_LARGE'
      | 'INVALID_IMAGE'
      | 'NO_RIOT_ID'
      | 'NO_LOL_ICON'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Jogadores ativos que ainda nao tem conta -- alimenta o Select de cadastro. */
export async function listClaimablePlayers(): Promise<PlayerDTO[]> {
  const players = await prisma.player.findMany({
    where: { active: true, passwordHash: null },
    include: withRoles,
    orderBy: { name: 'asc' },
  });
  return players.map(toPlayerDTO);
}

export interface RegisterInput {
  playerId: string;
  email: string;
  password: string;
}

export async function registerAccount(input: RegisterInput): Promise<AccountDTO> {
  const existing = await prisma.player.findUnique({ where: { id: input.playerId } });
  if (!existing) {
    throw new AuthError('Jogador não encontrado.', 'PLAYER_NOT_FOUND');
  }
  if (existing.passwordHash) {
    throw new AuthError('Esse jogador já tem uma conta.', 'ALREADY_CLAIMED');
  }

  const passwordHash = await hashPassword(input.password);

  const player = await prisma.player.update({
    where: { id: input.playerId },
    data: { email: input.email.trim().toLowerCase(), passwordHash },
    include: withRoles,
  });

  // Conveniencia, nao requisito: se a Riot API falhar (sem chave, rate
  // limit), o cadastro segue -- o jogador so troca a foto depois em /conta.
  if (player.puuid) {
    try {
      await syncLolPhoto(player.id);
    } catch {
      // silenciado de proposito
    }
  }

  const refreshed = await prisma.player.findUniqueOrThrow({
    where: { id: player.id },
    include: withRoles,
  });
  return toAccountDTO(refreshed);
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function loginAccount(input: LoginInput): Promise<AccountDTO> {
  const player = await prisma.player.findUnique({
    where: { email: input.email.trim().toLowerCase() },
    include: withRoles,
  });

  // Mensagem generica de proposito: nao revela se o e-mail existe.
  if (
    !player ||
    !player.passwordHash ||
    !(await verifyPassword(input.password, player.passwordHash))
  ) {
    throw new AuthError('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
  }

  return toAccountDTO(player);
}

export async function getAccountById(playerId: string): Promise<AccountDTO | null> {
  const player = await prisma.player.findUnique({ where: { id: playerId }, include: withRoles });
  return player ? toAccountDTO(player) : null;
}

/** Token de sessão amarrado à senha atual da conta (ver versaoDaSenha). */
export async function emitirSessao(playerId: string): Promise<string> {
  const { passwordHash } = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { passwordHash: true },
  });
  if (!passwordHash) throw new AuthError('Esse jogador não tem conta.', 'INVALID_CREDENTIALS');
  return signSession({ playerId, v: versaoDaSenha(passwordHash) });
}

/**
 * O jogador dono da sessão, ou null se ela não vale mais.
 *
 * Não basta o JWT estar assinado: a conta tem de existir e a senha ainda ser
 * a mesma de quando o token saiu. É o que faz trocar a senha, ou liberar uma
 * conta reivindicada por engano (scripts/liberar-conta.ts), derrubar as
 * sessões abertas em vez de deixá-las valendo pelos 30 dias do token.
 */
export async function validarSessao(token: string): Promise<string | null> {
  const sessao = verifySession(token);
  if (!sessao) return null;

  const player = await prisma.player.findUnique({
    where: { id: sessao.playerId },
    select: { passwordHash: true },
  });
  if (!player?.passwordHash || versaoDaSenha(player.passwordHash) !== sessao.v) return null;
  return sessao.playerId;
}

export interface ChangePasswordInput {
  playerId: string;
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: input.playerId } });

  if (!player.passwordHash || !(await verifyPassword(input.currentPassword, player.passwordHash))) {
    throw new AuthError('Senha atual incorreta.', 'INVALID_CREDENTIALS');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.player.update({ where: { id: input.playerId }, data: { passwordHash } });
}

/**
 * Usa o ícone de invocador como foto.
 *
 * Com a chave da Riot, busca o ícone ATUAL (Summoner-V4). Sem ela -- o caso de
 * produção, porque a chave de desenvolvimento expira em 24h -- usa o que o
 * cliente do LoL mandou na última partida importada (guardarIcones, no
 * ingest). Só falha se nenhum dos dois existir.
 */
export async function syncLolPhoto(playerId: string): Promise<AccountDTO> {
  const existing = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });

  let profileIconId = existing.profileIconId;
  if (hasRiotApi && existing.puuid) {
    const puuid = existing.puuid;
    profileIconId = await getSummonerByPuuid(puuid)
      .then((summoner) => summoner.profileIconId)
      .catch(() => existing.profileIconId);
  }
  if (profileIconId === null) {
    throw new AuthError(
      'Ainda não temos o seu ícone do LoL: ele chega com a primeira partida sua importada pelo cliente do LoL.',
      'NO_LOL_ICON'
    );
  }

  const photoUrl = await getProfileIconUrl(profileIconId);

  const player = await prisma.player.update({
    where: { id: playerId },
    data: { profileIconId, photoUrl, photoSource: 'LOL_ICON' },
    include: withRoles,
  });
  return toAccountDTO(player);
}

const MAX_PHOTO_BYTES = 300 * 1024;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+=*)$/;

/**
 * Guarda a foto enviada como `data:` URI direto na coluna, sem multer/disco/S3:
 * o Vercel tem filesystem efemero (mesma razao pela qual o SQLite em producao
 * e o Turso, nao arquivo -- ver DEPLOY.md), entao guardar como string no
 * mesmo banco funciona identico em dev e producao, sem infra nova. O
 * redimensionamento para caber no limite acontece no client, antes do POST.
 */
export async function setUploadedPhoto(playerId: string, imageBase64: string): Promise<AccountDTO> {
  const match = IMAGE_DATA_URL.exec(imageBase64);
  if (!match) {
    throw new AuthError('Formato de imagem inválido. Use JPEG, PNG ou WebP.', 'INVALID_IMAGE');
  }

  const byteLength = Buffer.from(match[2], 'base64').length;
  if (byteLength > MAX_PHOTO_BYTES) {
    throw new AuthError(
      'Imagem grande demais (limite de 300 KB após compressão).',
      'PHOTO_TOO_LARGE'
    );
  }

  const player = await prisma.player.update({
    where: { id: playerId },
    data: { photoUrl: imageBase64, photoSource: 'UPLOAD' },
    include: withRoles,
  });
  return toAccountDTO(player);
}
