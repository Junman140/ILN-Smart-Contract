export interface Subscription {
  id: string;
  endpointId: string;
  url: string;
  secret: string;
  eventTypes: string[];
  createdAt: number;
}

export interface SubscriptionInput {
  endpointId: string;
  url: string;
  secret: string;
  eventTypes: string[];
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `sub_${Date.now().toString(36)}_${counter}`;
}

export class SubscriptionStore {
  private readonly subs = new Map<string, Subscription>();

  create(input: SubscriptionInput): Subscription {
    const sub: Subscription = {
      id: nextId(),
      endpointId: input.endpointId,
      url: input.url,
      secret: input.secret,
      eventTypes: [...input.eventTypes],
      createdAt: Date.now(),
    };
    this.subs.set(sub.id, sub);
    return sub;
  }

  get(id: string): Subscription | undefined {
    return this.subs.get(id);
  }

  list(): Subscription[] {
    return [...this.subs.values()];
  }

  update(
    id: string,
    patch: Partial<SubscriptionInput>,
  ): Subscription | undefined {
    const sub = this.subs.get(id);
    if (!sub) return undefined;
    if (patch.url !== undefined) sub.url = patch.url;
    if (patch.secret !== undefined) sub.secret = patch.secret;
    if (patch.endpointId !== undefined) sub.endpointId = patch.endpointId;
    if (patch.eventTypes !== undefined) sub.eventTypes = [...patch.eventTypes];
    return sub;
  }

  delete(id: string): boolean {
    return this.subs.delete(id);
  }
}
