import { Router } from 'express';
import { currentMerchant } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import type { PaymentService } from '../services/paymentService.js';
import type { MemoryStore } from '../store/memoryStore.js';
import { batchRefundSchema } from './schemas.js';

export function refundsRouter(service: PaymentService, store: MemoryStore): Router {
  const router = Router();

  router.post('/batch', idempotency(store), async (req, res) => {
    const { items } = batchRefundSchema.parse(req.body);
    const results = await service.refundBatch(currentMerchant(req).id, items);
    const status = results.every((r) => r.ok) ? 201 : 207;
    res.status(status).json({ data: results });
  });

  return router;
}
