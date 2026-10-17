// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/egress-retry.spec.ts
// ============================================================================
import {
  isIdempotent,
  MAX_ATTEMPTS,
  backoffSeconds,
  jitteredDelay,
  classifyForRetry,
  nextStatus,
} from './egress-retry';

describe('egress-retry (outbound retry discipline)', () => {
  it('only idempotent methods may retry', () => {
    expect(isIdempotent('GET')).toBe(true);
    expect(isIdempotent('post')).toBe(false);
  });

  it('pins the attempt cap and backoff ladder', () => {
    expect(MAX_ATTEMPTS).toBe(4);
    const b0 = backoffSeconds(0);
    expect(b0.ok).toBe(true); if (b0.ok) expect(b0.value.seconds).toBe(1);
    const b1 = backoffSeconds(1);
    expect(b1.ok).toBe(true); if (b1.ok) expect(b1.value.seconds).toBe(3);
    const b2 = backoffSeconds(2);
    expect(b2.ok).toBe(true); if (b2.ok) expect(b2.value.seconds).toBe(10);
  });

  it('names exhaustion and invalid attempts', () => {
    const done = backoffSeconds(3);
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.reason).toBe('retry-exhausted');
    const neg = backoffSeconds(-1);
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.reason).toBe('retry-invalid-attempt');
  });

  it('applies full jitter within bounds', () => {
    expect(jitteredDelay(3, 0.5)).toBe(1500);
    expect(jitteredDelay(3, 0)).toBe(0);
    expect(jitteredDelay(3, 1)).toBe(3000);
    expect(jitteredDelay(2, 5)).toBe(2000);
  });

  it('classifies retryable statuses', () => {
    const pin = (code: number, transport: boolean, want: string) => {
      const v = classifyForRetry(code, transport);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value).toBe(want);
    };
    pin(503, false, 'retry');
    pin(429, false, 'retry');
    pin(408, false, 'retry');
    pin(200, false, 'no-retry');
    pin(404, false, 'no-retry');
    pin(200, true, 'retry');
    expect(classifyForRetry(99, false).ok).toBe(false);
  });

  it('derives delivery status from attempts', () => {
    expect(nextStatus(4, false)).toBe('exhausted');
    expect(nextStatus(2, false)).toBe('pending');
    expect(nextStatus(2, true)).toBe('delivered');
  });
});
