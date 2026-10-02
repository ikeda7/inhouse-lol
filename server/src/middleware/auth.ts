import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/env.js';
import { chaveConfere } from '../lib/auth.js';
import { dispensaChave, nivelDaEscrita, podeAdministrar } from '../lib/escritas.js';
import { criarLimitador } from '../lib/limite.js';
import { validarSessao } from '../services/auth.js';

/** Nome do cookie de sessao das contas de jogador (issue #3). */
export const SESSION_COOKIE = 'inhouse_session';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/** Onde o client e o companion mandam a chave do grupo. */
export const GROUP_KEY_HEADER = 'x-chave-do-grupo';

async function jogadorDaSessao(req: Request): Promise<string | null> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  return token ? validarSessao(token) : null;
}

/**
 * Exige sessao valida. `cors({credentials:true})` + `cookie-parser` (ver
 * app.ts) sao o que fazem o cookie ir e voltar entre o Vite (:5173) e a API
 * (:3333) em dev -- em producao os dois ja saem do mesmo host.
 *
 * Confere no banco, nao so a assinatura: senha trocada ou conta liberada
 * derrubam a sessao na hora (ver validarSessao).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const playerId = await jogadorDaSessao(req);
    if (!playerId) {
      res
        .status(401)
        .json({ success: false, error: 'Não autenticado.', code: 'NOT_AUTHENTICATED' });
      return;
    }
    req.playerId = playerId;
    next();
  } catch (erro) {
    next(erro);
  }
}

/**
 * Chutes errados de chave por IP. Com uma chave aleatoria, adivinhar ja e
 * inviavel; isto so tira a graca de tentar.
 */
const chutesDeChave = criarLimitador({ maximo: 20, janelaMs: 15 * 60_000 });

/**
 * Escrita so para quem e do grupo: conta logada OU chave do grupo.
 *
 * O site e o repositorio sao publicos, e a maior parte das rotas nao pede
 * login. Sem esta trava, qualquer visitante renomeava jogador, trocava Riot ID
 * (e com isso sequestrava a importacao do LCU), gravava partida falsa no
 * ranking e reivindicava a conta de qualquer amigo.
 *
 * Montado em /api antes de todas as rotas (app.ts). As excecoes -- leitura,
 * login, calculos que nao gravam, jogadas dentro da sala -- ficam em
 * lib/escritas.ts. Sem GROUP_KEY configurada, deixa tudo passar (ver
 * env.groupKey).
 */
export async function exigirGrupo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.groupKey || dispensaChave(req.method, req.path)) {
      next();
      return;
    }

    const chave = req.get(GROUP_KEY_HEADER);
    if (chave) {
      if (chaveConfere(chave, env.groupKey)) {
        next();
        return;
      }
      if (!chutesDeChave.tentar(req.ip ?? '?')) {
        res.status(429).json({
          success: false,
          error: 'Muitas tentativas com a chave errada. Espere alguns minutos.',
          code: 'RATE_LIMITED',
        });
        return;
      }
    }

    if (await jogadorDaSessao(req)) {
      next();
      return;
    }

    // Com admin nomeado a chave não é mais "do grupo": pedir a chave a um
    // visitante seria convidá-lo a procurar o que não é para ele ter.
    if (env.adminPlayerIds.length > 0) {
      if (nivelDaEscrita(req.method, req.path) === 'CONTA') {
        res
          .status(401)
          .json({ success: false, error: 'Não autenticado.', code: 'NOT_AUTHENTICATED' });
        return;
      }
      recusarPorAdmin(res);
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Essa ação é só para quem é do grupo: entre na sua conta ou informe a chave do grupo.',
      code: 'GROUP_KEY_REQUIRED',
    });
  } catch (erro) {
    next(erro);
  }
}

/**
 * Se ainda dá para reivindicar um jogador pelo site. Com admin nomeado, não:
 * criar conta só pedia a chave do grupo, e quem a tivesse virava "o Fulano".
 */
export function cadastroAberto(): boolean {
  return env.adminPlayerIds.length === 0;
}

/** Se quem fez o pedido pode administrar -- o mesmo critério que `exigirAdmin` aplica. */
export async function pedidoPodeAdministrar(req: Request): Promise<boolean> {
  if (env.adminPlayerIds.length === 0) return true;
  return podeAdministrar(await jogadorDaSessao(req), env.adminPlayerIds);
}

function recusarPorAdmin(res: Response): void {
  res.status(403).json({
    success: false,
    error: 'Só o admin do grupo pode fazer isso. Peça para ele, ou entre com a conta dele.',
    code: 'ADMIN_REQUIRED',
  });
}

/**
 * Com admin nomeado, so ele grava.
 *
 * Fica depois do `exigirGrupo` (app.ts) e, como ele, vale para todas as rotas:
 * o que nao esta nas duas listas de lib/escritas.ts e do admin, entao rota nova
 * nasce trancada. A propria conta passa (as rotas dela exigem sessao). A chave
 * so abre o que o agente local faz -- abrir a MD3 da noite e importar --,
 * porque ele nao tem navegador para logar; para o resto, so a conta do admin.
 */
export async function exigirAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nivel = nivelDaEscrita(req.method, req.path);
    const liberado =
      nivel === 'ABERTA' ||
      nivel === 'CONTA' ||
      (await pedidoPodeAdministrar(req)) ||
      (nivel === 'AGENTE' &&
        env.groupKey !== null &&
        chaveConfere(req.get(GROUP_KEY_HEADER), env.groupKey));

    if (liberado) {
      next();
      return;
    }
    recusarPorAdmin(res);
  } catch (erro) {
    next(erro);
  }
}
