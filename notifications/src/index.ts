import express from 'express';
import { SubscriptionStore } from './subscriptions/subscriptionStore.js';
import { WebhookDeliveryService } from './delivery/webhookDelivery.js';
import { createWebhooksRouter } from './api/webhooks.js';

const port = Number(process.env.PORT ?? 3001);

const store = new SubscriptionStore();
const delivery = new WebhookDeliveryService({
  http: async (url, init) => {
    const res = await fetch(url, init);
    return { status: res.status };
  },
  logger: (msg) => console.log(msg),
});

const app = express();
app.use(express.json());
app.use(createWebhooksRouter(store, delivery));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(port, () => {
  console.log(`ILN notifications service listening on ${port}`);
});
