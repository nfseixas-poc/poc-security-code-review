import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { currentMerchant, requireApiKey } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { internalRouter } from './routes/internal.js';
import { paymentsRouter } from './routes/payments.js';
import { webhooksRouter } from './routes/webhooks.js';
import { PaymentService } from './services/paymentService.js';
import { createSeededStore, type MemoryStore } from './store/memoryStore.js';

export function createApp(config: AppConfig, store: MemoryStore = createSeededStore()): Express {
  const app = express();
  const service = new PaymentService(store);

  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '100kb',
      // Guardamos o corpo bruto para validar a assinatura HMAC dos webhooks.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf.toString('utf8');
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/webhooks', webhooksRouter(service, store, config));
  app.use('/internal', internalRouter(store));

  const v1 = express.Router();
  v1.use(requireApiKey(store));
  v1.use('/payments', paymentsRouter(service, store));
  v1.get('/balance', (req, res) => {
    res.json(service.balance(currentMerchant(req).id));
  });
  app.use('/v1', v1);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'route_not_found', message: 'Rota não encontrada' } });
  });
  app.use(errorHandler);

  return app;
}
