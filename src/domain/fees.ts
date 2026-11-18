import type { PaymentMethod } from './types.js';

/**
 * Tabela de taxas (fake) cobradas do lojista.
 * Percentuais em basis points (1 bp = 0,01%) para evitar aritmética de ponto flutuante.
 */
export const FEE_TABLE = {
  pix: { percentBps: 99, fixedCents: 0 },
  boleto: { percentBps: 0, fixedCents: 349 },
  credit_card: { percentBps: 399, fixedCents: 39, perExtraInstallmentBps: 149 },
} as const;

export const MAX_INSTALLMENTS = 12;

/** Divisão inteira com arredondamento half-up (valores não negativos). */
function applyBps(amountCents: number, bps: number): number {
  return Math.floor((amountCents * bps + 5_000) / 10_000);
}

export function calculateFee(amountCents: number, method: PaymentMethod, installments = 1): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError('amount deve ser um inteiro positivo em centavos');
  }

  switch (method) {
    case 'pix':
      return applyBps(amountCents, FEE_TABLE.pix.percentBps) + FEE_TABLE.pix.fixedCents;
    case 'boleto':
      return FEE_TABLE.boleto.fixedCents;
    case 'credit_card': {
      if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
        throw new RangeError(`installments deve estar entre 1 e ${MAX_INSTALLMENTS}`);
      }
      const t = FEE_TABLE.credit_card;
      const bps = t.percentBps + (installments - 1) * t.perExtraInstallmentBps;
      return applyBps(amountCents, bps) + t.fixedCents;
    }
  }
}
