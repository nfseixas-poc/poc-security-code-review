import { Router } from 'express';
import { z } from 'zod';
import { currentMerchant } from '../middleware/auth.js';
import { postToMerchant } from '../services/notifier.js';

const notificationUrlSchema = z.object({ url: z.url() }).strict();

/** Configurações do próprio lojista. */
export function merchantRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { id, name, notificationUrl } = currentMerchant(req);
    res.json({ id, name, notificationUrl: notificationUrl ?? null });
  });

  router.put('/notification-url', (req, res) => {
    const { url } = notificationUrlSchema.parse(req.body);
    const merchant = currentMerchant(req);
    merchant.notificationUrl = url;
    res.json({ notificationUrl: url });
  });

  /** Dispara um evento de teste para o lojista validar a integração. */
  router.post('/notification-url/test', async (req, res) => {
    const { url } = notificationUrlSchema.partial().parse(req.body ?? {});
    const target = url ?? currentMerchant(req).notificationUrl;
    if (!target) {
      return res.status(400).json({ error: { code: 'no_url', message: 'Nenhuma URL de notificação configurada' } });
    }
    const result = await postToMerchant(target, { type: 'ping', sentAt: new Date().toISOString() });
    res.json({ url: target, ...result });
  });

  return router;
}
