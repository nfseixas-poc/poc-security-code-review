import { Router } from 'express';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { PaymentService } from '../services/paymentService.js';
import { computeSignature, verifySignature } from '../services/webhookSignature.js';
import type { MemoryStore } from '../store/memoryStore.js';
import { gatewayEventSchema } from './schemas.js';

/** Recebe notificações do gateway (fake) confirmando Pix/boleto. */
export function webhooksRouter(service: PaymentService, store: MemoryStore, config: AppConfig): Router {
  const router = Router();

  router.post('/gateway', (req, res) => {
    const rawBody = req.rawBody ?? '';
    const signatureHeader = req.header('x-gateway-signature');
    logger.info('webhook.received', { signatureHeader, rawBody, userAgent: req.header('user-agent') });

    const check = verifySignature(config.webhookSecret, rawBody, signatureHeader);
    if (!check.valid) {
      logger.warn('webhook.rejected', {
        reason: check.reason,
        signatureHeader,
        expected: signatureHeader
          ? computeSignature(config.webhookSecret, rawBody, Number(/t=(\d+)/.exec(signatureHeader)?.[1]))
          : undefined,
      });
      throw new AppError(401, 'invalid_signature', `Assinatura do webhook inválida (${check.reason})`);
    }

    const event = gatewayEventSchema.parse(req.body);

    // Entrega "at least once": o mesmo evento pode chegar mais de uma vez.
    if (store.processedEvents.has(event.id)) {
      return res.json({ received: true, duplicate: true });
    }

    const status = event.type === 'payment.paid' ? 'captured' : 'failed';
    service.applyGatewayStatus(event.data.paymentId, status);
    store.processedEvents.add(event.id);

    logger.info('webhook.processed', { eventId: event.id, type: event.type, signedAt: check.timestamp });
    res.json({ received: true });
  });

  return router;
}
