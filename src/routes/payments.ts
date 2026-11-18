import { Router } from 'express';
import { currentMerchant } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import type { PaymentService } from '../services/paymentService.js';
import type { MemoryStore } from '../store/memoryStore.js';
import { createPaymentSchema, createRefundSchema, listPaymentsQuery, paymentIdParam } from './schemas.js';

export function paymentsRouter(service: PaymentService, store: MemoryStore): Router {
  const router = Router();
  const idem = idempotency(store);

  router.post('/', idem, (req, res) => {
    const input = createPaymentSchema.parse(req.body);
    const payment = service.create(currentMerchant(req).id, input);
    res.status(201).json(payment);
  });

  router.get('/', (req, res) => {
    const filter = listPaymentsQuery.parse(req.query);
    res.json({ data: service.list(currentMerchant(req).id, filter) });
  });

  router.get('/:id', (req, res) => {
    const { id } = paymentIdParam.parse(req.params);
    res.json(service.get(currentMerchant(req).id, id));
  });

  router.post('/:id/capture', idem, (req, res) => {
    const { id } = paymentIdParam.parse(req.params);
    res.json(service.capture(currentMerchant(req).id, id));
  });

  router.post('/:id/cancel', idem, (req, res) => {
    const { id } = paymentIdParam.parse(req.params);
    res.json(service.cancel(currentMerchant(req).id, id));
  });

  router.post('/:id/refunds', idem, async (req, res) => {
    const { id } = paymentIdParam.parse(req.params);
    const { amount, reason } = createRefundSchema.parse(req.body ?? {});
    res.status(201).json(await service.refund(currentMerchant(req).id, id, amount, reason));
  });

  return router;
}
