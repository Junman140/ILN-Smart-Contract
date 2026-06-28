import { describe, expect, it, vi } from 'vitest';
import { WebhookDeliveryService, type HttpClient } from '../src/delivery/webhookDelivery';

function makeService(http: HttpClient, now?: () => number) {
  return new WebhookDeliveryService({ http, now });
}

describe('WebhookDeliveryService', () => {
  const endpoint = { id: 'e1', url: 'https://hook.example/abc', secret: 's' };

  it('signs and delivers on success', async () => {
    const http = vi.fn(async () => ({ status: 200 }));
    const svc = makeService(http);
    const res = await svc.deliver(endpoint, { hello: 'world' });
    expect(res.ok).toBe(true);
    expect(http).toHaveBeenCalledTimes(1);
    const [, init] = http.mock.calls[0]!;
    expect(init.headers['x-iln-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records failures and opens circuit after threshold', async () => {
    const http = vi.fn(async () => ({ status: 500 }));
    const svc = makeService(http);
    for (let i = 0; i < 5; i++) {
      await svc.deliver(endpoint, { i });
    }
    expect(svc.getCircuitState(endpoint.id)).toBe('open');
    const result = await svc.deliver(endpoint, { i: 6 });
    expect(result.skippedReason).toBe('circuit_open');
  });

  it('blocks once the rate limit is hit', async () => {
    const http = vi.fn(async () => ({ status: 200 }));
    let t = 0;
    const svc = new WebhookDeliveryService({ http, now: () => t });
    for (let i = 0; i < 1000; i++) {
      const r = await svc.deliver(endpoint, { i });
      expect(r.ok).toBe(true);
    }
    const blocked = await svc.deliver(endpoint, { i: 'over' });
    expect(blocked.skippedReason).toBe('rate_limited');
    expect(blocked.status).toBe(429);
  });

  it('treats http errors as failures', async () => {
    const http = vi.fn(async () => {
      throw new Error('network');
    });
    const svc = makeService(http);
    const res = await svc.deliver(endpoint, {});
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
  });
});
