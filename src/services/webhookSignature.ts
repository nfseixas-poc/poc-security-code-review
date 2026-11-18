import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Formato do header (inspirado no Stripe):
 *   X-Gateway-Signature: t=<unix_seconds>,v1=<hex(hmac_sha256(secret, `${t}.${rawBody}`))>
 */
export function signPayload(secret: string, rawBody: string, timestamp: number): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | undefined,
  toleranceSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;

  const parts = new Map(
    header.split(',').map((kv) => {
      const [k, ...rest] = kv.trim().split('=');
      return [k, rest.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1');
  if (!Number.isInteger(timestamp) || !provided) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const providedBuf = Buffer.from(provided, 'hex');
  return providedBuf.length === expected.length && timingSafeEqual(providedBuf, expected);
}
