import type { NextFunction, Request, Response } from 'express';
import { criarLimitador } from '../lib/limite.js';

/** Middleware de limite de tentativas por IP e rota (ver lib/limite.ts). */
export function limitar(opcoes: { maximo: number; janelaMs: number }) {
  const limitador = criarLimitador(opcoes);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (limitador.tentar(`${req.ip ?? '?'}|${req.baseUrl}${req.path}`)) {
      next();
      return;
    }
    res.status(429).json({
      success: false,
      error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
      code: 'RATE_LIMITED',
    });
  };
}
