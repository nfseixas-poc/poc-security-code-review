import type { NextFunction, Request, Response } from 'express';
import type { Merchant } from '../domain/types.js';
import { unauthorized } from '../lib/errors.js';
import { hashApiKey, type MemoryStore } from '../store/memoryStore.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      merchant?: Merchant;
      rawBody?: string;
    }
  }
}

/** Autenticação por API key: `Authorization: Bearer sk_test_...` */
export function requireApiKey(store: MemoryStore) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer (sk_(?:test|live)_[A-Za-z0-9_]+)$/.exec(header);
    if (!match?.[1]) return next(unauthorized());

    // Comparamos hashes (tamanho fixo), então a busca não depende do conteúdo da chave.
    const merchant = store.findMerchantByKeyHash(hashApiKey(match[1]));
    if (!merchant) return next(unauthorized());

    req.merchant = merchant;
    next();
  };
}

export function currentMerchant(req: Request): Merchant {
  if (!req.merchant) throw unauthorized();
  return req.merchant;
}
