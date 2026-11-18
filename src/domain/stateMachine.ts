import type { PaymentStatus } from './types.js';

/** Transições de status permitidas. Qualquer outra é rejeitada. */
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['captured', 'failed', 'canceled'],
  authorized: ['captured', 'canceled', 'failed'],
  captured: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  refunded: [],
  failed: [],
  canceled: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
