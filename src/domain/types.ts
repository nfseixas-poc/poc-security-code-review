export type PaymentMethod = 'pix' | 'boleto' | 'credit_card';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'partially_refunded'
  | 'refunded'
  | 'failed'
  | 'canceled';

export interface CardSummary {
  brand: 'visa' | 'mastercard' | 'amex' | 'elo' | 'unknown';
  last4: string;
}

export interface Merchant {
  id: string;
  name: string;
  /** SHA-256 da API key. A chave em texto puro nunca é armazenada. */
  apiKeyHash: string;
  /** URL que recebe POSTs quando o status de um pagamento muda. */
  notificationUrl?: string;
}

export interface Payment {
  id: string;
  merchantId: string;
  /** Valor em centavos (inteiro). Nunca usar float para dinheiro. */
  amount: number;
  currency: 'BRL';
  method: PaymentMethod;
  installments: number;
  status: PaymentStatus;
  /** Taxa cobrada do lojista, em centavos. */
  fee: number;
  refundedAmount: number;
  card?: CardSummary;
  description?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  merchantId: string;
  amount: number;
  reason?: string;
  createdAt: string;
}
