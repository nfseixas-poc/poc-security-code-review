export interface AppConfig {
  port: number;
  webhookSecret: string;
  webhookToleranceSeconds: number;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    port: Number(process.env.PORT ?? 3000),
    // Em produção o segredo é obrigatório; fora dela usamos um valor de desenvolvimento.
    webhookSecret: requireEnv('WEBHOOK_SECRET', isProd ? undefined : 'whsec_dev_only'),
    webhookToleranceSeconds: Number(process.env.WEBHOOK_TOLERANCE_SECONDS ?? 300),
  };
}
