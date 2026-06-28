# @iln/notifications

Webhook and email notification service for the Invoice Liquidity Network.

## Features

- Webhook delivery with HMAC-SHA256 payload signing (`x-iln-signature`)
- Per-endpoint circuit breaker (opens after 5 consecutive failures, 10-minute cooldown, single half-open probe)
- Per-endpoint sliding-window rate limiter (1000 deliveries / hour by default)
- Subscription CRUD (`POST /webhooks`, `GET /webhooks/:id`, `DELETE /webhooks/:id`)
- Email delivery via Resend SDK adapter
- Vitest unit tests with a 90% coverage threshold

## Local development

```bash
cd notifications
npm install
npm run dev            # tsx src/index.ts
npm run test:coverage  # vitest with 90% threshold + lcov report
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3001`  | HTTP listen port (also serves `/health`) |

## Docker

```bash
# Build the image (multi-stage; final image runs as non-root)
docker build -t iln/notifications:latest ./notifications

# Run standalone
docker run --rm -p 3001:3001 iln/notifications:latest

# Or via docker-compose (includes Postgres dependency)
docker compose up -d notifications
```

The image exposes a `HEALTHCHECK` against `GET /health` and listens on port `3001`.
