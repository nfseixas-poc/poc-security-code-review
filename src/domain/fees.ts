import type { PaymentMethod } from './types.js';

/**
 * Tabela de taxas (fake) cobradas do lojista.
 * Percentuais em basis points (1 bp = 0,01%) para evitar aritmética de ponto flutuante.
 */
export const MAX_INSTALLMENTS = 12;

const CARD_BASE_BPS = 399;
const CARD_FIXED_CENTS = 39;
const CARD_PER_EXTRA_INSTALLMENT_BPS = 149;

/**
 * Acréscimo em bps por quantidade de parcelas, pré-calculado.
 * À vista não tem acréscimo; cada parcela extra soma 1,49%.
 */
export const INSTALLMENT_SURCHARGE_BPS: readonly number[] = Array.from(
  { length: MAX_INSTALLMENTS },
  (_, i) => i * CARD_PER_EXTRA_INSTALLMENT_BPS,
);

interface FeeRule {
  percentBps: (installments: number) => number;
  fixedCents: number;
}

const FEE_RULES: Record<PaymentMethod, FeeRule> = {
  pix: { percentBps: () => 99, fixedCents: 0 },
  boleto: { percentBps: () => 0, fixedCents: 349 },
  credit_card: {
    percentBps: (installments) => CARD_BASE_BPS + (INSTALLMENT_SURCHARGE_BPS[installments] ?? 0),
    fixedCents: CARD_FIXED_CENTS,
  },
};

/** Divisão inteira com arredondamento half-up (valores não negativos). */
function applyBps(amountCents: number, bps: number): number {
  return Math.floor((amountCents * bps + 5_000) / 10_000);
}

export function calculateFee(amountCents: number, method: PaymentMethod, installments = 1): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError('amount deve ser um inteiro positivo em centavos');
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    throw new RangeError(`installments deve estar entre 1 e ${MAX_INSTALLMENTS}`);
  }
  if (method !== 'credit_card' && installments !== 1) {
    throw new RangeError('parcelamento só é permitido no cartão de crédito');
  }

  const rule = FEE_RULES[method];
  return applyBps(amountCents, rule.percentBps(installments)) + rule.fixedCents;
}
