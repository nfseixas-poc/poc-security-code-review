# poc-ai-security-review

API de pagamentos **fake** em TypeScript, usada como sandbox para avaliar ferramentas de
revisão de código.

> ⚠️ Nada aqui processa dinheiro de verdade. Não use em produção.

## Stack

Node 20+ · TypeScript · Express 5 · Zod 4 · Vitest · Supertest. Armazenamento em memória.

## Rodando

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testes
npm run typecheck
```

## Funcionalidades

| Recurso | Endpoint |
|---|---|
| Health check | `GET /health` |
| Criar pagamento (Pix, boleto, cartão) | `POST /v1/payments` |
| Listar (filtros: `status`, `createdFrom`, `createdTo`, `limit`) / consultar | `GET /v1/payments`, `GET /v1/payments/:id` |
| Capturar pré-autorização | `POST /v1/payments/:id/capture` |
| Cancelar | `POST /v1/payments/:id/cancel` |
| Estorno total/parcial | `POST /v1/payments/:id/refunds` |
| Saldo do lojista | `GET /v1/balance` |
| Webhook do gateway (confirma Pix/boleto) | `POST /webhooks/gateway` |

### Princípios do código

- Dinheiro sempre em **centavos inteiros**; taxas em basis points com arredondamento half-up.
- **Autenticação por API key**: só o hash SHA-256 fica armazenado.
- **Isolamento entre lojistas**: pagamento de outro lojista responde 404.
- **Idempotency-Key** obrigatória em operações que movimentam dinheiro.
- **Máquina de estados** explícita para status de pagamento.
- **PAN/CVV nunca armazenados**: só bandeira + últimos 4 dígitos. O logger mascara campos sensíveis.
- **Webhooks** com HMAC-SHA256, comparação em tempo constante, janela de timestamp e deduplicação.
- Validação de entrada com Zod (`strict`), limite de payload e erros sem stack trace.

## Credenciais de demonstração

| Lojista | API key |
|---|---|
| ACME Store (`mer_acme`) | `sk_test_acme_123` |
| Globex Ltda (`mer_globex`) | `sk_test_globex_456` |

Cartões de teste: `4111111111111111` (aprovado), `4000000000000002` (recusado).

## Exemplos

```bash
# Pagamento com cartão em 3x
curl -X POST localhost:3000/v1/payments \
  -H 'Authorization: Bearer sk_test_acme_123' \
  -H 'Idempotency-Key: pedido-0001' \
  -H 'Content-Type: application/json' \
  -d '{"amount":15000,"method":"credit_card","installments":3,
       "card":{"number":"4111111111111111","expMonth":12,"expYear":2030,"cvv":"123","holderName":"Fulano"}}'

# Pix (fica pending até o webhook confirmar)
curl -X POST localhost:3000/v1/payments \
  -H 'Authorization: Bearer sk_test_acme_123' \
  -H 'Idempotency-Key: pedido-0002' \
  -H 'Content-Type: application/json' \
  -d '{"amount":5000,"method":"pix"}'

# Estorno parcial
curl -X POST localhost:3000/v1/payments/<id>/refunds \
  -H 'Authorization: Bearer sk_test_acme_123' \
  -H 'Idempotency-Key: estorno-0001' \
  -H 'Content-Type: application/json' \
  -d '{"amount":2000}'
```

Para simular o webhook, gere a assinatura com `signPayload()` de
[src/services/webhookSignature.ts](src/services/webhookSignature.ts) (veja os testes em
[tests/api.test.ts](tests/api.test.ts)).

## Estrutura

```
src/
  domain/      regras puras: taxas, cartão (Luhn/bandeira), máquina de estados
  services/    PaymentService, assinatura de webhook
  middleware/  auth, idempotência, tratamento de erros
  routes/      rotas HTTP + schemas Zod
  store/       "banco" em memória + lojistas de demonstração
tests/         testes de domínio e de API
```
