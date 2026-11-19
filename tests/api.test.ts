import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { signPayload } from '../src/services/webhookSignature.js';

const config: AppConfig = { port: 0, webhookSecret: 'whsec_test', webhookToleranceSeconds: 300 };
const ACME = 'Bearer sk_test_acme_123';
const GLOBEX = 'Bearer sk_test_globex_456';

const validCard = {
  number: '4111111111111111',
  expMonth: 12,
  expYear: new Date().getUTCFullYear() + 2,
  cvv: '123',
  holderName: 'Fulano de Tal',
};

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp(config);
});

const idemKey = () => `idem-${randomUUID()}`;

function createPayment(body: object, auth = ACME, key = idemKey()) {
  return request(app).post('/v1/payments').set('Authorization', auth).set('Idempotency-Key', key).send(body);
}

function sendWebhook(event: object, opts: { secret?: string; timestamp?: number } = {}) {
  const raw = JSON.stringify(event);
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  return request(app)
    .post('/webhooks/gateway')
    .set('Content-Type', 'application/json')
    .set('X-Gateway-Signature', signPayload(opts.secret ?? config.webhookSecret, raw, ts))
    .send(raw);
}

describe('autenticação', () => {
  it('rejeita requisições sem API key ou com chave inválida', async () => {
    await request(app).get('/v1/payments').expect(401);
    await request(app).get('/v1/payments').set('Authorization', 'Bearer sk_test_nope').expect(401);
  });

  it('health não exige auth', async () => {
    await request(app).get('/health').expect(200);
  });
});

describe('pagamentos com cartão', () => {
  it('cria pagamento capturado sem armazenar PAN/CVV', async () => {
    const res = await createPayment({ amount: 10_000, method: 'credit_card', installments: 3, card: validCard });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'captured', fee: 399 + 2 * 149 + 39, card: { brand: 'visa', last4: '1111' } });
    expect(JSON.stringify(res.body)).not.toContain('4111111111111111');
    expect(JSON.stringify(res.body)).not.toContain('"cvv"');
  });

  it('autoriza e captura depois', async () => {
    const created = await createPayment({ amount: 5_000, method: 'credit_card', capture: false, card: validCard });
    expect(created.body.status).toBe('authorized');

    const captured = await request(app)
      .post(`/v1/payments/${created.body.id}/capture`)
      .set('Authorization', ACME)
      .set('Idempotency-Key', idemKey());
    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe('captured');
  });

  it('cartão de teste recusado vira failed', async () => {
    const res = await createPayment({ amount: 5_000, method: 'credit_card', card: { ...validCard, number: '4000000000000002' } });
    expect(res.body).toMatchObject({ status: 'failed', failureReason: 'card_declined' });
  });

  it('valida payload', async () => {
    expect((await createPayment({ amount: 10.5, method: 'pix' })).status).toBe(400);
    expect((await createPayment({ amount: 1000, method: 'credit_card' })).status).toBe(400);
    expect((await createPayment({ amount: 1000, method: 'pix', card: validCard })).status).toBe(400);
    expect((await createPayment({ amount: 1000, method: 'credit_card', card: { ...validCard, number: '4111111111111112' } })).status).toBe(400);
  });
});

describe('isolamento entre lojistas', () => {
  it('um lojista não enxerga pagamento de outro', async () => {
    const created = await createPayment({ amount: 1_000, method: 'pix' }, ACME);
    await request(app).get(`/v1/payments/${created.body.id}`).set('Authorization', GLOBEX).expect(404);
    const list = await request(app).get('/v1/payments').set('Authorization', GLOBEX);
    expect(list.body.data).toHaveLength(0);
  });
});

describe('idempotência', () => {
  it('repete a resposta original para mesma chave e mesmo corpo', async () => {
    const key = idemKey();
    const body = { amount: 2_000, method: 'pix' };
    const first = await createPayment(body, ACME, key);
    const second = await createPayment(body, ACME, key);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
  });

  it('rejeita a mesma chave com corpo diferente', async () => {
    const key = idemKey();
    await createPayment({ amount: 2_000, method: 'pix' }, ACME, key);
    const res = await createPayment({ amount: 9_999, method: 'pix' }, ACME, key);
    expect(res.status).toBe(422);
  });

  it('exige a chave', async () => {
    await request(app).post('/v1/payments').set('Authorization', ACME).send({ amount: 1000, method: 'pix' }).expect(400);
  });
});

describe('estornos e saldo', () => {
  it('estorno parcial, depois total, e bloqueia excesso', async () => {
    const pay = await createPayment({ amount: 10_000, method: 'credit_card', card: validCard });
    const refund = (amount?: number) =>
      request(app)
        .post(`/v1/payments/${pay.body.id}/refunds`)
        .set('Authorization', ACME)
        .set('Idempotency-Key', idemKey())
        .send(amount === undefined ? {} : { amount });

    expect((await refund(3_000)).status).toBe(201);
    expect((await refund(8_000)).status).toBe(422);
    expect((await refund()).status).toBe(201);
    expect((await refund(100)).status).toBe(409);

    const p = await request(app).get(`/v1/payments/${pay.body.id}`).set('Authorization', ACME);
    expect(p.body).toMatchObject({ status: 'refunded', refundedAmount: 10_000 });
  });

  it('saldo considera taxas e estornos', async () => {
    const pay = await createPayment({ amount: 10_000, method: 'credit_card', card: validCard });
    await request(app)
      .post(`/v1/payments/${pay.body.id}/refunds`)
      .set('Authorization', ACME)
      .set('Idempotency-Key', idemKey())
      .send({ amount: 1_000 });

    const bal = await request(app).get('/v1/balance').set('Authorization', ACME);
    expect(bal.body).toEqual({ currency: 'BRL', gross: 10_000, refunded: 1_000, fees: 438, net: 8_562 });
  });
});

describe('webhooks do gateway', () => {
  it('confirma Pix com assinatura válida e ignora duplicatas', async () => {
    const pay = await createPayment({ amount: 1_000, method: 'pix' });
    const event = { id: 'evt_1', type: 'payment.paid', data: { paymentId: pay.body.id } };

    expect((await sendWebhook(event)).body).toEqual({ received: true });
    expect((await sendWebhook(event)).body).toEqual({ received: true, duplicate: true });

    const p = await request(app).get(`/v1/payments/${pay.body.id}`).set('Authorization', ACME);
    expect(p.body.status).toBe('captured');
  });

  it('rejeita assinatura inválida informando o motivo', async () => {
    const pay = await createPayment({ amount: 1_000, method: 'pix' });
    const event = { id: 'evt_2', type: 'payment.paid', data: { paymentId: pay.body.id } };

    const res = await sendWebhook(event, { secret: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('signature_mismatch');
  });

  it('rejeita header ausente ou malformado', async () => {
    const res = await request(app).post('/webhooks/gateway').send({ id: 'evt_x', type: 'payment.paid', data: { paymentId: 'x' } });
    expect(res.body.error.message).toContain('missing_header');

    const bad = await request(app)
      .post('/webhooks/gateway')
      .set('X-Gateway-Signature', 'v1=abc')
      .send({ id: 'evt_y', type: 'payment.paid', data: { paymentId: 'x' } });
    expect(bad.body.error.message).toContain('malformed_header');
  });

  it('não permite transição inválida via webhook', async () => {
    const pay = await createPayment({ amount: 1_000, method: 'pix' });
    await sendWebhook({ id: 'evt_3', type: 'payment.failed', data: { paymentId: pay.body.id } });
    const res = await sendWebhook({ id: 'evt_4', type: 'payment.paid', data: { paymentId: pay.body.id } });
    expect(res.status).toBe(409);
  });
});
