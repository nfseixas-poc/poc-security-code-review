import type { CardSummary } from './types.js';

export function isValidLuhn(cardNumber: string): boolean {
  if (!/^\d{12,19}$/.test(cardNumber)) return false;

  let sum = 0;
  let double = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = Number(cardNumber[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function detectBrand(cardNumber: string): CardSummary['brand'] {
  if (/^4/.test(cardNumber)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(cardNumber)) return 'mastercard';
  if (/^3[47]/.test(cardNumber)) return 'amex';
  if (/^(4011|4389|5041|5067|6277|6362|6363|6504|6505|6516)/.test(cardNumber)) return 'elo';
  return 'unknown';
}

/** Reduz o cartão a dados não sensíveis. O PAN completo nunca sai daqui. */
export function summarizeCard(cardNumber: string): CardSummary {
  return { brand: detectBrand(cardNumber), last4: cardNumber.slice(-4) };
}

export function isExpired(month: number, year: number, now = new Date()): boolean {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}
