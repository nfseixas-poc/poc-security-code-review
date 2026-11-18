import { isExpired, isValidLuhn, summarizeCard } from '../domain/card.js';
import { calculateFee } from '../domain/fees.js';
import { canTransition } from '../domain/stateMachine.js';
import type { Payment, PaymentMethod, PaymentStatus, Refund } from '../domain/types.js';
import { AppError, invalidState, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { newId, type MemoryStore } from '../store/memoryStore.js';

/** Cartão de teste que o "gateway" sempre recusa. */
export const DECLINED_TEST_CARD = '4000000000000002';

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  holderName: string;
}

export interface CreatePaymentInput {
  amount: number;
  method: PaymentMethod;
  installments?: number;
  capture?: boolean;
  description?: string;
  card?: CardInput;
}

export interface ListPaymentsFilter {
  status?: PaymentStatus;
  limit: number;
}

export class PaymentService {
  constructor(private readonly store: MemoryStore) {}

  create(merchantId: string, input: CreatePaymentInput): Payment {
    const installments = input.method === 'credit_card' ? (input.installments ?? 1) : 1;
    const now = new Date().toISOString();

    const payment: Payment = {
      id: newId('pay'),
      merchantId,
      amount: input.amount,
      currency: 'BRL',
      method: input.method,
      installments,
      status: 'pending',
      fee: calculateFee(input.amount, input.method, installments),
      refundedAmount: 0,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };

    if (input.method === 'credit_card') {
      this.processCard(payment, input);
    }

    this.store.payments.set(payment.id, payment);
    logger.info('payment.created', { paymentId: payment.id, merchantId, status: payment.status });
    return payment;
  }

  private processCard(payment: Payment, input: CreatePaymentInput): void {
    const card = input.card;
    if (!card) {
      throw new AppError(400, 'validation_error', 'card é obrigatório para credit_card');
    }
    if (!isValidLuhn(card.number)) {
      throw new AppError(400, 'invalid_card', 'Número de cartão inválido');
    }
    if (isExpired(card.expMonth, card.expYear)) {
      throw new AppError(400, 'expired_card', 'Cartão expirado');
    }

    // Guardamos só bandeira + últimos 4 dígitos. PAN e CVV são descartados.
    payment.card = summarizeCard(card.number);

    if (card.number === DECLINED_TEST_CARD) {
      payment.status = 'failed';
      payment.failureReason = 'card_declined';
      return;
    }
    payment.status = input.capture === false ? 'authorized' : 'captured';
  }

  get(merchantId: string, paymentId: string): Payment {
    const payment = this.store.payments.get(paymentId);
    // Pagamento de outro lojista responde 404 (não 403) para não vazar existência.
    if (!payment || payment.merchantId !== merchantId) throw notFound('Pagamento');
    return payment;
  }

  list(merchantId: string, filter: ListPaymentsFilter): Payment[] {
    return [...this.store.payments.values()]
      .filter((p) => p.merchantId === merchantId)
      .filter((p) => !filter.status || p.status === filter.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit);
  }

  /** Busca textual na descrição (case-insensitive). Ex.: "pedido 12" ou "assinatura|mensal". */
  search(query: string, limit: number): Payment[] {
    const pattern = new RegExp(query, 'i');
    return [...this.store.payments.values()]
      .filter((p) => p.description !== undefined && pattern.test(p.description))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  capture(merchantId: string, paymentId: string): Payment {
    const payment = this.get(merchantId, paymentId);
    if (payment.status !== 'authorized') {
      throw invalidState(`Só é possível capturar pagamentos autorizados (status atual: ${payment.status})`);
    }
    return this.transition(payment, 'captured');
  }

  cancel(merchantId: string, paymentId: string): Payment {
    const payment = this.get(merchantId, paymentId);
    if (!canTransition(payment.status, 'canceled')) {
      throw invalidState(`Não é possível cancelar um pagamento com status ${payment.status}`);
    }
    return this.transition(payment, 'canceled');
  }

  refund(merchantId: string, paymentId: string, amount: number | undefined, reason?: string): Refund {
    const payment = this.get(merchantId, paymentId);
    if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
      throw invalidState(`Só é possível estornar pagamentos capturados (status atual: ${payment.status})`);
    }

    const refundable = payment.amount - payment.refundedAmount;
    const refundAmount = amount ?? refundable;
    if (refundAmount <= 0 || refundAmount > refundable) {
      throw new AppError(422, 'invalid_amount', `Valor de estorno deve estar entre 1 e ${refundable}`);
    }

    payment.refundedAmount += refundAmount;
    this.transition(payment, payment.refundedAmount === payment.amount ? 'refunded' : 'partially_refunded');

    const refund: Refund = {
      id: newId('ref'),
      paymentId,
      merchantId,
      amount: refundAmount,
      reason,
      createdAt: new Date().toISOString(),
    };
    this.store.refunds.set(refund.id, refund);
    logger.info('refund.created', { refundId: refund.id, paymentId, amount: refundAmount });
    return refund;
  }

  /** Saldo líquido do lojista: capturado - estornado - taxas. */
  balance(merchantId: string) {
    let gross = 0;
    let refunded = 0;
    let fees = 0;
    for (const p of this.store.payments.values()) {
      if (p.merchantId !== merchantId) continue;
      if (!['captured', 'partially_refunded', 'refunded'].includes(p.status)) continue;
      gross += p.amount;
      refunded += p.refundedAmount;
      fees += p.fee;
    }
    return { currency: 'BRL' as const, gross, refunded, fees, net: gross - refunded - fees };
  }

  /** Usado pelos webhooks do gateway (Pix/boleto confirmados ou falhos). */
  applyGatewayStatus(paymentId: string, status: 'captured' | 'failed'): Payment {
    const payment = this.store.payments.get(paymentId);
    if (!payment) throw notFound('Pagamento');
    if (!canTransition(payment.status, status)) {
      throw invalidState(`Transição inválida: ${payment.status} -> ${status}`);
    }
    return this.transition(payment, status);
  }

  private transition(payment: Payment, to: PaymentStatus): Payment {
    if (!canTransition(payment.status, to)) {
      throw invalidState(`Transição inválida: ${payment.status} -> ${to}`);
    }
    payment.status = to;
    payment.updatedAt = new Date().toISOString();
    return payment;
  }
}
