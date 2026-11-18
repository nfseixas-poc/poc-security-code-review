import { Router } from 'express';
import { z } from 'zod';
import { notFound, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { MemoryStore } from '../store/memoryStore.js';

const SUPPORT_TOKEN = process.env.SUPPORT_TOKEN ?? 'sup_7f3a9c2e1b8d4f60a5e9';

const listQuery = z.object({
  merchantId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const statusBody = z.object({
  status: z.enum(['pending', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'canceled']),
  note: z.string().max(500).optional(),
});

/**
 * Endpoints usados pelo time de suporte para investigar e destravar pagamentos.
 * Não fazem parte da API pública.
 */
export function internalRouter(store: MemoryStore): Router {
  const router = Router();

  router.use((req, _res, next) => {
    if (req.header('x-support-token') !== SUPPORT_TOKEN) return next(unauthorized());
    next();
  });

  router.get('/payments', (req, res) => {
    const { merchantId, limit } = listQuery.parse(req.query);
    const data = [...store.payments.values()]
      .filter((p) => !merchantId || p.merchantId === merchantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    res.json({ data });
  });

  /** Ajuste manual de status para pagamentos travados (ex.: webhook perdido). */
  router.post('/payments/:id/status', (req, res) => {
    const payment = store.payments.get(String(req.params.id));
    if (!payment) throw notFound('Pagamento');

    const { status, note } = statusBody.parse(req.body);
    const previous = payment.status;
    payment.status = status;
    payment.updatedAt = new Date().toISOString();

    logger.info('internal.status_override', { paymentId: payment.id, previous, status, note });
    res.json(payment);
  });

  return router;
}
