import { Router } from 'express';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { PaymentService } from '../services/paymentService.js';
import { notifyPaymentUpdated } from '../services/notifier.js';
import { verifySignature } from '../services/webhookSignature.js';
import type { MemoryStore } from '../store/memoryStore.js';
import { gatewayEventSchema } from './schemas.js';

/** Recebe notificações do gateway (fake) confirmando Pix/boleto. */
export function webhooksRouter(service: PaymentService, store: MemoryStore, config: AppConfig): Router {
  const router = Router();

  router.post('/gateway', (req, res) => {
    const ok = verifySignature(
      config.webhookSecret,
      req.rawBody ?? '',
      req.header('x-gateway-signature'),
      config.webhookToleranceSeconds,
    );
    if (!ok) throw new AppError(401, 'invalid_signature', 'Assinatura do webhook inválida');

    const event = gatewayEventSchema.parse(req.body);

    // Entrega "at least once": o mesmo evento pode chegar mais de uma vez.
    if (store.processedEvents.has(event.id)) {
      return res.json({ received: true, duplicate: true });
    }

    const status = event.type === 'payment.paid' ? 'captured' : 'failed';
    const payment = service.applyGatewayStatus(event.data.paymentId, status);
    store.processedEvents.add(event.id);

    const merchant = store.merchants.get(payment.merchantId);
    if (merchant) notifyPaymentUpdated(merchant, payment);

    logger.info('webhook.processed', { eventId: event.id, type: event.type });
    res.json({ received: true });
  });

  return router;
}
