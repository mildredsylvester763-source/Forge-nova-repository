// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/egress-retry.ts
// ============================================================================
// Outbound retry discipline. Only idempotent methods (GET, HEAD, PUT,
// DELETE) may retry — a failed POST is a caller decision, never an
// automatic re-send. Backoff is short (seconds, not hours) because the
// caller is waiting; past the last step, exhaustion is a named refusal.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'PUT', 'DELETE'];
export const MAX_ATTEMPTS = 4;
const BACKOFF_SECONDS = [1, 3, 10];

export function isIdempotent(method: string): boolean {
  return IDEMPOTENT_METHODS.includes(method.toUpperCase());
}

export function backoffSeconds(attempt: number): Verdict<{ seconds: number }> {
  if (!Number.isInteger(attempt) || attempt < 0) return { ok: false, reason: 'retry-invalid-attempt' };
  if (attempt >= BACKOFF_SECONDS.length) return { ok: false, reason: 'retry-exhausted' };
  return { ok: true, value: { seconds: BACKOFF_SECONDS[attempt] } };
}

// Full jitter: a bounded random multiple of the base delay, so concurrent
// callers do not synchronize their retries into a thundering herd.
export function jitteredDelay(baseSeconds: number, randomUnit: number): number {
  const u = Math.min(Math.max(randomUnit, 0), 1);
  return Math.round(baseSeconds * 1000 * u);
}

export type RetryClass = 'retry' | 'no-retry';

// Classifies whether an HTTP status or transport error justifies a retry.
export function classifyForRetry(statusCode: number, timedOut: boolean): Verdict<RetryClass> {
  if (timedOut) return { ok: true, value: 'retry' };
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return { ok: false, reason: 'retry-invalid-status' };
  }
  if (statusCode >= 500 || statusCode === 408 || statusCode === 429) return { ok: true, value: 'retry' };
  return { ok: true, value: 'no-retry' };
}

export function nextStatus(attempts: number, succeeded: boolean): 'delivered' | 'pending' | 'exhausted' {
  if (succeeded) return 'delivered';
  return attempts >= MAX_ATTEMPTS ? 'exhausted' : 'pending';
}
