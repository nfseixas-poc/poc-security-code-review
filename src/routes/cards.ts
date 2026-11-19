import { Router } from 'express';
import { currentMerchant } from '../middleware/auth.js';
import type { PaymentService } from '../services/paymentService.js';
import { listCardsQuery, saveCardSchema } from './schemas.js';

/** Cartões salvos para compra em 1 clique. */
export function cardsRouter(service: PaymentService): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { customerEmail, card } = saveCardSchema.parse(req.body);
    res.status(201).json(service.saveCard(currentMerchant(req).id, customerEmail, card));
  });

  router.get('/', (req, res) => {
    const { customerEmail } = listCardsQuery.parse(req.query);
    res.json({ data: service.listCards(currentMerchant(req).id, customerEmail) });
  });

  return router;
}
