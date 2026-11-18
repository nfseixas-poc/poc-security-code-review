import { describe, expect, it } from 'vitest';
import { detectBrand, isExpired, isValidLuhn, summarizeCard } from '../src/domain/card.js';
import { calculateFee, INSTALLMENT_SURCHARGE_BPS, MAX_INSTALLMENTS } from '../src/domain/fees.js';
import { canTransition } from '../src/domain/stateMachine.js';

describe('calculateFee', () => {
  it('pix: 0,99% com arredondamento half-up', () => {
    expect(calculateFee(10_000, 'pix')).toBe(99);
    expect(calculateFee(150, 'pix')).toBe(1); // 1,485 -> 1
    expect(calculateFee(152, 'pix')).toBe(2); // 1,5048 -> 2
  });

  it('boleto: taxa fixa', () => {
    expect(calculateFee(10_000, 'boleto')).toBe(349);
  });

  it('cartão: 3,99% + R$0,39, +1,49% por parcela extra', () => {
    expect(calculateFee(10_000, 'credit_card', 1)).toBe(587);
    expect(calculateFee(10_000, 'credit_card', 3)).toBe(885);
  });

  it('tabela de acréscimo por parcelas', () => {
    expect(INSTALLMENT_SURCHARGE_BPS).toHaveLength(MAX_INSTALLMENTS);
    expect(INSTALLMENT_SURCHARGE_BPS[0]).toBe(0);
    expect(INSTALLMENT_SURCHARGE_BPS[1]).toBe(149);
  });

  it('parcelamento só no cartão', () => {
    expect(() => calculateFee(10_000, 'pix', 2)).toThrow(RangeError);
  });

  it('rejeita valores e parcelas inválidos', () => {
    expect(() => calculateFee(0, 'pix')).toThrow(RangeError);
    expect(() => calculateFee(10.5, 'pix')).toThrow(RangeError);
    expect(() => calculateFee(1000, 'credit_card', 13)).toThrow(RangeError);
  });
});

describe('card', () => {
  it('valida Luhn', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true);
    expect(isValidLuhn('4111111111111112')).toBe(false);
    expect(isValidLuhn('abc')).toBe(false);
  });

  it('detecta bandeira e resume sem expor PAN', () => {
    expect(detectBrand('5555555555554444')).toBe('mastercard');
    expect(summarizeCard('4111111111111111')).toEqual({ brand: 'visa', last4: '1111' });
  });

  it('detecta cartão expirado', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(isExpired(5, 2026, now)).toBe(true);
    expect(isExpired(6, 2026, now)).toBe(false);
    expect(isExpired(1, 2027, now)).toBe(false);
  });
});

describe('state machine', () => {
  it('permite fluxos válidos e bloqueia inválidos', () => {
    expect(canTransition('authorized', 'captured')).toBe(true);
    expect(canTransition('captured', 'refunded')).toBe(true);
    expect(canTransition('refunded', 'captured')).toBe(false);
    expect(canTransition('failed', 'captured')).toBe(false);
    expect(canTransition('captured', 'canceled')).toBe(false);
  });
});
