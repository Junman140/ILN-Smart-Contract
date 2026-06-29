import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailSubscriptionsRouter } from '../src/api/email';
import { EmailDeliveryService } from '../src/delivery/emailDelivery';
import { EmailSubscriptionStore } from '../src/subscriptions/emailSubscriptionStore';

function makeApp() {
  let nowMs = 1_700_000_000_000;
  const store = new EmailSubscriptionStore();
  const sentEmails: Array<{ to: string; subject: string; html: string; text?: string }> = [];
  const client = {
    send: vi.fn(async (message: { to: string; subject: string; html: string; text?: string }) => {
      sentEmails.push(message);
      return { id: 'msg_1' };
    }),
  };
  const delivery = new EmailDeliveryService(client, 'noreply@iln.dev');

  const app = express();
  app.use(express.json());
  app.use(
    createEmailSubscriptionsRouter(store, delivery, {
      tokenSecret: 'test-secret',
      publicUrl: 'https://notifications.example.com',
      now: () => nowMs,
      verificationTtlMs: 60_000,
      unsubscribeTtlMs: 120_000,
    }),
  );

  return {
    app,
    store,
    sentEmails,
    client,
    advanceTime(ms: number) {
      nowMs += ms;
      return nowMs;
    },
    currentTime() {
      return nowMs;
    },
  };
}

function extractToken(html: string, fragment: string): string {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const href = hrefs.find((value) => value.includes(fragment));

  if (!href) {
    throw new Error(`Could not find link for ${fragment}`);
  }

  const token = new URL(href).searchParams.get('token');
  if (!token) {
    throw new Error(`Could not find token for ${fragment}`);
  }

  return token;
}

describe('email subscriptions router', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a pending subscription and sends a verification email', async () => {
    const { app, store, sentEmails } = makeApp();

    const res = await request(app).post('/subscriptions/email').send({
      address: 'GABCDE1234567890',
      email: 'user@example.com',
      events: ['invoice.submitted', 'invoice.paid'],
    });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    expect(res.body.consentAt).toBeNull();
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.status).toBe('pending');
    expect(store.list()[0]?.consentAt).toBeNull();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe('user@example.com');
    expect(sentEmails[0]?.subject).toContain('Verify your ILN email notifications');
    expect(sentEmails[0]?.html).toContain('/subscriptions/verify?token=');
    expect(sentEmails[0]?.html).toContain('/subscriptions/email?token=');
  });

  it('activates a subscription when the verification token is used', async () => {
    const { app, store, sentEmails, advanceTime, currentTime } = makeApp();

    const createRes = await request(app).post('/subscriptions/email').send({
      address: 'GABCDE1234567890',
      email: 'user@example.com',
      events: ['invoice.submitted'],
    });

    const verifyToken = extractToken(sentEmails[0]!.html, '/subscriptions/verify');
    advanceTime(5_000);

    const verifyRes = await request(app).get('/subscriptions/verify').query({ token: verifyToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe('active');
    expect(verifyRes.body.consentAt).toBe(currentTime());

    const subscription = store.get(createRes.body.id);
    expect(subscription?.status).toBe('active');
    expect(subscription?.consentAt).toBe(currentTime());
  });

  it('unsubscribes with the signed token from the footer', async () => {
    const { app, store, sentEmails } = makeApp();

    const createRes = await request(app).post('/subscriptions/email').send({
      address: 'GABCDE1234567890',
      email: 'user@example.com',
      events: ['invoice.paid'],
    });

    const unsubscribeToken = extractToken(sentEmails[0]!.html, '/subscriptions/email');
    const unsubscribeRes = await request(app)
      .delete('/subscriptions/email')
      .query({ token: unsubscribeToken });

    expect(unsubscribeRes.status).toBe(200);
    expect(unsubscribeRes.body.status).toBe('unsubscribed');

    const subscription = store.get(createRes.body.id);
    expect(subscription?.status).toBe('unsubscribed');
    expect(subscription?.unsubscribedAt).toBeGreaterThan(0);
  });
});
