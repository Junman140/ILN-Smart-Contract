import { CircuitBreaker, type CircuitState } from './circuitBreaker.js';
import { SlidingWindowRateLimiter } from './rateLimiter.js';
import { signPayload } from './signature.js';

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
}

export interface DeliveryResult {
  ok: boolean;
  status: number;
  skippedReason?: 'circuit_open' | 'rate_limited';
}

export type HttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number }>;

export interface WebhookDeliveryOptions {
  http: HttpClient;
  logger?: (msg: string) => void;
  now?: () => number;
}

interface EndpointState {
  breaker: CircuitBreaker;
  limiter: SlidingWindowRateLimiter;
}

export class WebhookDeliveryService {
  private readonly endpoints = new Map<string, EndpointState>();

  constructor(private readonly opts: WebhookDeliveryOptions) {}

  getCircuitState(endpointId: string): CircuitState {
    return this.stateFor(endpointId).breaker.getState();
  }

  async deliver(
    endpoint: WebhookEndpoint,
    payload: unknown,
  ): Promise<DeliveryResult> {
    const state = this.stateFor(endpoint.id);
    if (!state.limiter.tryConsume()) {
      this.opts.logger?.(`webhook_rate_limited endpoint=${endpoint.id}`);
      return { ok: false, status: 429, skippedReason: 'rate_limited' };
    }
    if (!state.breaker.canAttempt()) {
      this.opts.logger?.(`webhook_circuit_open endpoint=${endpoint.id}`);
      return { ok: false, status: 0, skippedReason: 'circuit_open' };
    }

    const body = JSON.stringify(payload);
    const signature = signPayload(endpoint.secret, body);
    try {
      const res = await this.opts.http(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-iln-signature': signature,
        },
        body,
      });
      if (res.status >= 200 && res.status < 300) {
        state.breaker.recordSuccess();
        return { ok: true, status: res.status };
      }
      state.breaker.recordFailure(this.opts.logger);
      return { ok: false, status: res.status };
    } catch (err) {
      state.breaker.recordFailure(this.opts.logger);
      return { ok: false, status: 0 };
    }
  }

  private stateFor(endpointId: string): EndpointState {
    let s = this.endpoints.get(endpointId);
    if (!s) {
      s = {
        breaker: new CircuitBreaker({ now: this.opts.now }),
        limiter: new SlidingWindowRateLimiter({ now: this.opts.now }),
      };
      this.endpoints.set(endpointId, s);
    }
    return s;
  }
}
