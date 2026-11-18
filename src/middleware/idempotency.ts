import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import type { MemoryStore } from '../store/memoryStore.js';
import { currentMerchant } from './auth.js';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Exige `Idempotency-Key` em operações que movimentam dinheiro.
 * - Mesma chave + mesmo corpo  => devolve a resposta original (sem reprocessar).
 * - Mesma chave + corpo diferente => 422.
 * As chaves são isoladas por lojista.
 */
export function idempotency(store: MemoryStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('idempotency-key');
    if (!key || !KEY_PATTERN.test(key)) {
      return next(new AppError(400, 'idempotency_key_required', 'Header Idempotency-Key ausente ou inválido'));
    }

    const merchant = currentMerchant(req);
    const requestHash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    const existing = store.getIdempotent(merchant.id, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return next(new AppError(422, 'idempotency_conflict', 'Idempotency-Key reutilizada com outro payload'));
      }
      res.setHeader('Idempotent-Replayed', 'true');
      return res.status(existing.status).json(existing.body);
    }

    // Intercepta a resposta para guardá-la (somente sucessos são memorizados).
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400) {
        store.saveIdempotent(merchant.id, key, { requestHash, status: res.statusCode, body });
      }
      return originalJson(body);
    };
    next();
  };
}
