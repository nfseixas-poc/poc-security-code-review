const SENSITIVE_KEYS = new Set([
  'authorization',
  'apikey',
  'api_key',
  'cardnumber',
  'card_number',
  'number',
  'cvv',
  'password',
  'secret',
]);

/** Remove campos sensíveis (PAN, CVV, chaves) antes de logar. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

type Level = 'info' | 'warn' | 'error';

function log(level: Level, message: string, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};
