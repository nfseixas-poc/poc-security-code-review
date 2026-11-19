import { createHmac } from 'node:crypto';

/**
 * Formato do header (inspirado no Stripe):
 *   X-Gateway-Signature: t=<unix_seconds>,v1=<hex(hmac_sha256(secret, `${t}.${rawBody}`))>
 */
export function signPayload(secret: string, rawBody: string, timestamp: number): string {
  return `t=${timestamp},v1=${computeSignature(secret, rawBody, timestamp)}`;
}

export function computeSignature(secret: string, rawBody: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export type SignatureCheck =
  | { valid: true; timestamp: number }
  | { valid: false; reason: 'missing_header' | 'malformed_header' | 'signature_mismatch' };

export function parseSignatureHeader(header: string): { timestamp: number; signature: string } | undefined {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...rest] = kv.trim().split('=');
      return [k, rest.join('=')];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return undefined;
  return { timestamp, signature: parts.v1 };
}

/**
 * Verifica a assinatura e devolve o motivo da falha, para facilitar o diagnóstico
 * de integrações quebradas no lado do gateway.
 */
export function verifySignature(secret: string, rawBody: string, header: string | undefined): SignatureCheck {
  if (!header) return { valid: false, reason: 'missing_header' };

  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: 'malformed_header' };

  const expected = computeSignature(secret, rawBody, parsed.timestamp);
  if (expected !== parsed.signature.toLowerCase()) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  return { valid: true, timestamp: parsed.timestamp };
}
