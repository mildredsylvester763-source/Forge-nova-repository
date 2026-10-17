// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/webhook-dispatch.spec.ts
// ============================================================================

import { backoffSeconds, filterSubscriptions, matchesSubscription, nextStatus } from './webhook-dispatch';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('webhook-dispatch engine', () => {
  it('matches exact, wildcard, and all-patterns', () => {
    expect(matchesSubscription('invoice.created', 'invoice.created')).toBe(true);
    expect(matchesSubscription('invoice.created', 'invoice.paid')).toBe(false);
    expect(matchesSubscription('invoice.*', 'invoice.created')).toBe(true);
    expect(matchesSubscription('invoice.*', 'payment.received')).toBe(false);
    expect(matchesSubscription('all', 'invoice.created')).toBe(true);
  });

  it('filters the pinned subscription set', () => {
    const r = filterSubscriptions(['invoice.*', 'payment.received'], 'invoice.paid');
    if (!r.ok) return;
    expect(r.value.matched).toEqual(['invoice.*']);
  });

  it('refuses malformed event names by name', () => {
    const r = filterSubscriptions([], 'bad_event_name');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('webhook-invalid-event-name');
  });

  it('backoff escalates and then refuses by name', () => {
    const b0 = backoffSeconds(0);
    const b2 = backoffSeconds(2);
    const b4 = backoffSeconds(4);
    if (!b0.ok || !b2.ok || !b4.ok) {
      expect(b0.ok && b2.ok && b4.ok).toBe(true);
      return;
    }
    expect(b0.value.seconds).toBe(60);
    expect(b2.value.seconds).toBe(1800);
    expect(b4.value.seconds).toBe(28800);
    const done = backoffSeconds(5);
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.reason).toBe('webhook-retries-exhausted');
  });

  it('status transitions: delivered, pending, exhausted', () => {
    expect(nextStatus(0, true)).toBe('delivered');
    expect(nextStatus(0, false)).toBe('pending');
    expect(nextStatus(4, false)).toBe('exhausted');
    expect(nextStatus(3, false)).toBe('pending');
  });

  it('500-case sweep: matched patterns always match, backoff never negative', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const entity = ['invoice', 'payment', 'expense'][Math.floor(rnd() * 3)];
      const verb = ['created', 'paid', 'received'][Math.floor(rnd() * 3)];
      const event = entity + '.' + verb;
      const v = filterSubscriptions(['all', 'invoice.*', event], event);
      if (!v.ok) throw new Error('filter refused in sweep');
      for (const m of v.value.matched) {
        expect(matchesSubscription(m, event)).toBe(true);
      }
      const attempt = Math.floor(rnd() * 7);
      const b = backoffSeconds(attempt);
      if (!b.ok) {
        expect(b.reason).toBe('webhook-retries-exhausted');
      } else {
        expect(b.value.seconds).toBeGreaterThan(0);
      }
    }
  });
});
