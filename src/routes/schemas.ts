import { z } from 'zod';
import { MAX_INSTALLMENTS } from '../domain/fees.js';

/** R$ 0,50 a R$ 100.000,00, sempre em centavos inteiros. */
const amountCents = z.number().int().min(50).max(10_000_000);

const cardSchema = z.object({
  number: z.string().regex(/^\d{12,19}$/, 'número deve ter 12 a 19 dígitos'),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
  cvv: z.string().regex(/^\d{3,4}$/),
  holderName: z.string().trim().min(2).max(100),
});

export const createPaymentSchema = z
  .object({
    amount: amountCents,
    method: z.enum(['pix', 'boleto', 'credit_card']),
    installments: z.number().int().min(1).max(MAX_INSTALLMENTS).optional(),
    capture: z.boolean().optional(),
    description: z.string().trim().max(255).optional(),
    card: cardSchema.optional(),
  })
  .strict()
  .refine((p) => p.method !== 'credit_card' || p.card !== undefined, {
    message: 'card é obrigatório quando method = credit_card',
    path: ['card'],
  })
  .refine((p) => p.method === 'credit_card' || p.card === undefined, {
    message: 'card só é aceito quando method = credit_card',
    path: ['card'],
  });

export const listPaymentsQuery = z
  .object({
    status: z
      .enum(['pending', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'canceled'])
      .optional(),
    /** Intervalo inclusivo em ISO 8601 (UTC), ex.: 2026-01-01T00:00:00Z */
    createdFrom: z.iso.datetime().optional(),
    createdTo: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => !q.createdFrom || !q.createdTo || Date.parse(q.createdFrom) <= Date.parse(q.createdTo), {
    message: 'createdFrom deve ser anterior ou igual a createdTo',
    path: ['createdFrom'],
  });

export const createRefundSchema = z
  .object({
    amount: amountCents.optional(),
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

export const paymentIdParam = z.object({
  id: z.string().regex(/^pay_[a-f0-9]{24}$/, 'id de pagamento inválido'),
});

export const gatewayEventSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['payment.paid', 'payment.failed']),
  data: z.object({ paymentId: z.string().min(1) }),
});
