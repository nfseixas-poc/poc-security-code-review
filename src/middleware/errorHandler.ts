import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Payload inválido',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // body-parser: JSON malformado ou corpo grande demais
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type: string }).type;
    if (type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'JSON malformado' } });
    }
    if (type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'payload_too_large', message: 'Payload muito grande' } });
    }
  }

  // Erro inesperado: loga detalhes, mas não vaza stack trace para o cliente.
  logger.error('unhandled_error', {
    path: req.path,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
  });
  return res.status(500).json({ error: { code: 'internal_error', message: 'Erro interno' } });
}
