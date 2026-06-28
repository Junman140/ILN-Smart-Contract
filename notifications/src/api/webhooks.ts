import { Router } from 'express';
import type { WebhookDeliveryService } from '../delivery/webhookDelivery.js';
import type { SubscriptionStore } from '../subscriptions/subscriptionStore.js';

export function createWebhooksRouter(
  store: SubscriptionStore,
  delivery: WebhookDeliveryService,
): Router {
  const router = Router();

  router.get('/webhooks/:id', (req, res) => {
    const sub = store.get(req.params.id);
    if (!sub) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({
      id: sub.id,
      url: sub.url,
      eventTypes: sub.eventTypes,
      circuitState: delivery.getCircuitState(sub.endpointId),
    });
  });

  router.post('/webhooks', (req, res) => {
    const { url, secret, eventTypes, endpointId } = req.body ?? {};
    if (!url || !secret || !Array.isArray(eventTypes)) {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }
    const sub = store.create({
      endpointId: endpointId ?? url,
      url,
      secret,
      eventTypes,
    });
    res.status(201).json(sub);
  });

  router.delete('/webhooks/:id', (req, res) => {
    const ok = store.delete(req.params.id);
    res.status(ok ? 204 : 404).end();
  });

  return router;
}
