import { randomBytes } from 'node:crypto';

export interface GatewayClient {
  refund(paymentId: string, amount: number): Promise<{ gatewayRefundId: string }>;
}

/** Simula a chamada HTTP ao adquirente, com latência de rede. */
export class FakeGatewayClient implements GatewayClient {
  constructor(private readonly latencyMs = 30) {}

  async refund(_paymentId: string, _amount: number) {
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    return { gatewayRefundId: `gw_ref_${randomBytes(8).toString('hex')}` };
  }
}
