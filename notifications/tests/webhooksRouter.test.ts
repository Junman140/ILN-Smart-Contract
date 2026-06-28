import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createWebhooksRouter } from '../src/api/webhooks';
import { SubscriptionStore } from '../src/subscriptions/subscriptionStore';
import { WebhookDeliveryService } from '../src/delivery/webhookDelivery';

function makeApp() {
  const store = new SubscriptionStore();
  const delivery = new WebhookDeliveryService({
    http: vi.fn(async () => ({ status: 200 })),
  });
  const app = express();
  app.use(express.json());
  app.use(createWebhooksRouter(store, delivery));
  return { app, store, delivery };
}

async function request(app: express.Express, method: string, path: string, body?: any) {
  const { default: http } = await import('node:http');
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = http.createServer(app).listen(0, () => {
      const { port } = server.address() as any;
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json' } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            let parsed: any = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch {
              parsed = text;
            }
            server.close();
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('webhooks router', () => {
  it('creates a subscription', async () => {
    const { app } = makeApp();
    const res = await request(app, 'POST', '/webhooks', {
      url: 'https://x',
      secret: 'k',
      eventTypes: ['A'],
    });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://x');
  });

  it('rejects invalid bodies', async () => {
    const { app } = makeApp();
    const res = await request(app, 'POST', '/webhooks', { url: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns circuit state on GET', async () => {
    const { app, store } = makeApp();
    const sub = store.create({ endpointId: 'e1', url: 'https://x', secret: 'k', eventTypes: ['A'] });
    const res = await request(app, 'GET', `/webhooks/${sub.id}`);
    expect(res.status).toBe(200);
    expect(res.body.circuitState).toBe('closed');
  });

  it('404s for unknown subscriptions', async () => {
    const { app } = makeApp();
    const res = await request(app, 'GET', '/webhooks/nope');
    expect(res.status).toBe(404);
  });

  it('deletes a subscription', async () => {
    const { app, store } = makeApp();
    const sub = store.create({ endpointId: 'e1', url: 'https://x', secret: 'k', eventTypes: ['A'] });
    const res = await request(app, 'DELETE', `/webhooks/${sub.id}`);
    expect(res.status).toBe(204);
  });
});
