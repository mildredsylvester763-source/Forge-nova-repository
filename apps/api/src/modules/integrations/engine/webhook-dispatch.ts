// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/webhook-dispatch.ts
// ============================================================================

// Webhook event routing and retry discipline. Event names are
// '<entity>.<verb>' (invoice.created, payment.received). Subscriptions may
// be exact or end in '.*' (invoice.*) — 'all' matches everything. Retries
// follow a fixed escalating schedule; past the last step the delivery is
// exhausted, a named refusal — no silent infinite retry.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const BACKOFF_SECONDS = [60, 300, 1800, 7200, 28800];
export const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

export function matchesSubscription(pattern: string, event: string): boolean {
  if (pattern === 'all') return true;
  if (typeof pattern !== 'string' || typeof event !== 'string') return false;
  if (pattern.endsWith('.*')) return event.startsWith(pattern.slice(0, -1));
  return pattern === event;
}

export interface SubscriptionMatch {
  matched: string[];
}

export function filterSubscriptions(patterns: string[], event: string): Verdict<SubscriptionMatch> {
  if (typeof event !== 'string' || !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(event)) {
    return { ok: false, reason: 'webhook-invalid-event-name' };
  }
  if (!Array.isArray(patterns)) return { ok: false, reason: 'webhook-no-subscriptions' };
  const matched = patterns.filter((p) => matchesSubscription(p, event));
  return { ok: true, value: { matched } };
}

export function backoffSeconds(attempt: number): Verdict<{ seconds: number; exhausted: boolean }> {
  if (!Number.isInteger(attempt) || attempt < 0) return { ok: false, reason: 'webhook-invalid-attempt' };
  if (attempt >= MAX_ATTEMPTS) return { ok: false, reason: 'webhook-retries-exhausted' };
  return { ok: true, value: { seconds: BACKOFF_SECONDS[attempt], exhausted: false } };
}

export function nextStatus(attempt: number, delivered: boolean): 'delivered' | 'pending' | 'exhausted' {
  if (delivered) return 'delivered';
  return attempt + 1 >= MAX_ATTEMPTS ? 'exhausted' : 'pending';
}
