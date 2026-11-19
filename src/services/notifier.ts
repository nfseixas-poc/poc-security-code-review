import type { Merchant, Payment } from '../domain/types.js';
import { logger } from '../lib/logger.js';

export interface NotificationResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

const TIMEOUT_MS = 5_000;

/** Envia um POST JSON para a URL de notificação configurada pelo lojista. */
export async function postToMerchant(url: string, payload: unknown): Promise<NotificationResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'poc-payments-notifier/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body: body.slice(0, 2_000) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Notifica mudança de status sem bloquear o fluxo de pagamento. */
export function notifyPaymentUpdated(merchant: Merchant, payment: Payment): void {
  if (!merchant.notificationUrl) return;
  void postToMerchant(merchant.notificationUrl, { type: 'payment.updated', data: payment }).then((r) => {
    if (!r.ok) logger.warn('merchant.notification_failed', { merchantId: merchant.id, ...r });
  });
}
