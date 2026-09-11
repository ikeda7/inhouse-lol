import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { DraftError } from '../lib/autoBalance.js';
import { RiotApiError } from '../lib/riot.js';
import { SeriesError } from '../services/series.js';
import { LcuError } from '../lib/lcu.js';
import { AuthError } from '../services/auth.js';

/**
 * Express 4 nao encaminha rejeicao de Promise para o error handler sozinho.
 * Este wrapper faz isso, entao nenhuma rota precisa de try/catch so para
 * repassar o erro.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

interface ErrorPayload {
  status: number;
  body: { success: false; error: string; code?: string; details?: unknown };
}

/**
 * Traduz os erros de dominio em HTTP. Cada tipo de erro tem um significado
 * proprio, e virar tudo 500 esconde erro de uso do usuario.
 */
function translate(error: unknown): ErrorPayload {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Dados inválidos.',
        code: 'VALIDATION_ERROR',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }

  if (error instanceof DraftError) {
    // Composicao impossivel e erro do usuario (faltou gente de uma role),
    // nao falha do servidor -> 422.
    return {
      status: error.code === 'INFEASIBLE_ROLES' ? 422 : 400,
      body: { success: false, error: error.message, code: error.code, details: error.details },
    };
  }

  if (error instanceof SeriesError) {
    const conflictCodes = [
      'MATCH_EXISTS',
      'SERIES_FINISHED',
      'FEARLESS_VIOLATION',
      'SERIES_ONGOING',
    ];
    return {
      status:
        error.code === 'SERIES_NOT_FOUND' ? 404 : conflictCodes.includes(error.code) ? 409 : 400,
      body: { success: false, error: error.message, code: error.code },
    };
  }

  if (error instanceof LcuError) {
    // Dados do cliente do LoL fora do esperado: e problema do payload recebido,
    // nao do servidor -> 422.
    return {
      status: 422,
      body: { success: false, error: error.message, code: error.code, details: error.details },
    };
  }

  if (error instanceof RiotApiError) {
    const statusByCode: Record<string, number> = {
      RIOT_DISABLED: 503,
      NOT_FOUND: 404,
      INVALID_KEY: 502,
      RATE_LIMITED: 429,
      INVALID_RIOT_ID: 400,
    };
    return {
      status: statusByCode[error.code] ?? 502,
      body: { success: false, error: error.message, code: error.code },
    };
  }

  if (error instanceof AuthError) {
    const statusByCode: Record<string, number> = {
      PLAYER_NOT_FOUND: 404,
      ALREADY_CLAIMED: 409,
      INVALID_CREDENTIALS: 401,
      PHOTO_TOO_LARGE: 413,
      INVALID_IMAGE: 400,
      NO_RIOT_ID: 400,
    };
    return {
      status: statusByCode[error.code] ?? 400,
      body: { success: false, error: error.message, code: error.code },
    };
  }

  // Violacao de unique do Prisma (nome, riotId ou email repetido).
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  ) {
    return {
      status: 409,
      body: {
        success: false,
        error: 'Já existe um registro com esse valor único (nome, Riot ID ou e-mail).',
        code: 'UNIQUE_VIOLATION',
      },
    };
  }

  if ((error as { code?: string })?.code === 'P2025') {
    return {
      status: 404,
      body: { success: false, error: 'Registro não encontrado.', code: 'NOT_FOUND' },
    };
  }

  return {
    status: 500,
    body: { success: false, error: 'Erro interno.', code: 'INTERNAL_ERROR' },
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { status, body } = translate(error);
  if (status >= 500) {
    // Erro inesperado: loga o stack no servidor, devolve mensagem generica.
    console.error('[erro não tratado]', error);
  }
  res.status(status).json(body);
}
