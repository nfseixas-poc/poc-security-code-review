import { createHash, randomBytes } from 'node:crypto';
import type { Merchant, Payment, Refund, SavedCard } from '../domain/types.js';

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

interface IdempotencyRecord {
  requestHash: string;
  status: number;
  body: unknown;
}

/**
 * "Banco de dados" em memória. Suficiente para a POC; tudo some ao reiniciar.
 */
export class MemoryStore {
  readonly merchants = new Map<string, Merchant>();
  readonly payments = new Map<string, Payment>();
  readonly refunds = new Map<string, Refund>();
  readonly savedCards = new Map<string, SavedCard>();
  /** Webhooks já processados (proteção contra replay). */
  readonly processedEvents = new Set<string>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  findMerchantByKeyHash(hash: string): Merchant | undefined {
    for (const m of this.merchants.values()) {
      if (m.apiKeyHash === hash) return m;
    }
    return undefined;
  }

  getIdempotent(merchantId: string, key: string): IdempotencyRecord | undefined {
    return this.idempotency.get(`${merchantId}:${key}`);
  }

  saveIdempotent(merchantId: string, key: string, record: IdempotencyRecord): void {
    this.idempotency.set(`${merchantId}:${key}`, record);
  }
}

/** Lojistas de demonstração. As chaves aparecem no README. */
export const DEMO_MERCHANTS = [
  { id: 'mer_acme', name: 'ACME Store', apiKey: 'sk_test_acme_123' },
  { id: 'mer_globex', name: 'Globex Ltda', apiKey: 'sk_test_globex_456' },
] as const;

export function createSeededStore(): MemoryStore {
  const store = new MemoryStore();
  for (const m of DEMO_MERCHANTS) {
    store.merchants.set(m.id, { id: m.id, name: m.name, apiKeyHash: hashApiKey(m.apiKey) });
  }
  return store;
}
