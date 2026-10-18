// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/rate-limit.ts
// ============================================================================
// Per-destination token-bucket rate limiting. The bucket state is pure data
// (tokens + lastRefillMs); the service owns the Map that stores it, the
// engine owns every decision. Refusals are named, never silent. Pure: no
// DB, no clock — time enters as nowMs.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export const BUCKET_MIN_CAPACITY = 1;
export const BUCKET_MAX_CAPACITY = 10000;
export const REFILL_PER_MINUTE_MIN = 1;
export const REFILL_PER_MINUTE_MAX = 10000;
export const MAX_COST = 100;

export function validateBucketCapacity(capacity: number): Verdict<{ capacity: number }> {
  if (!Number.isInteger(capacity) || capacity < BUCKET_MIN_CAPACITY || capacity > BUCKET_MAX_CAPACITY) {
    return { ok: false, reason: 'rate-limit-invalid-capacity' };
  }
  return { ok: true, value: { capacity } };
}

export function validateRefillPerMinute(refillPerMinute: number): Verdict<{ refillPerMinute: number }> {
  if (
    !Number.isInteger(refillPerMinute) ||
    refillPerMinute < REFILL_PER_MINUTE_MIN ||
    refillPerMinute > REFILL_PER_MINUTE_MAX
  ) {
    return { ok: false, reason: 'rate-limit-invalid-refill' };
  }
  return { ok: true, value: { refillPerMinute } };
}

export function newBucket(capacity: number, nowMs: number): Verdict<BucketState> {
  const cap = validateBucketCapacity(capacity);
  if (!cap.ok) return cap;
  if (!Number.isInteger(nowMs) || nowMs < 0) return { ok: false, reason: 'rate-limit-invalid-now' };
  return { ok: true, value: { tokens: capacity, lastRefillMs: nowMs } };
}

function validateState(state: BucketState): Verdict<null | BucketState> {
  if (!state || typeof state !== 'object') return { ok: false, reason: 'rate-limit-invalid-state' };
  if (typeof state.tokens !== 'number' || !Number.isInteger(state.tokens) || state.tokens < 0) {
    return { ok: false, reason: 'rate-limit-invalid-tokens' };
  }
  if (!Number.isInteger(state.lastRefillMs) || state.lastRefillMs < 0) {
    return { ok: false, reason: 'rate-limit-invalid-last-refill' };
  }
  return { ok: true, value: state };
}

// Refill by elapsed wall time. Tokens never exceed capacity. Time going
// backwards is a named refusal — a clock is never trusted blindly.
export function refillBucket(
  state: BucketState,
  capacity: number,
  refillPerMinute: number,
  nowMs: number,
): Verdict<BucketState> {
  const cap = validateBucketCapacity(capacity);
  if (!cap.ok) return cap;
  const ref = validateRefillPerMinute(refillPerMinute);
  if (!ref.ok) return ref;
  const valid = validateState(state);
  if (!valid.ok) return valid;
  if (!Number.isInteger(nowMs) || nowMs < 0) return { ok: false, reason: 'rate-limit-invalid-now' };
  if (nowMs < state.lastRefillMs) return { ok: false, reason: 'rate-limit-clock-went-backwards' };
  const elapsedMs = nowMs - state.lastRefillMs;
  const gained = Math.floor((elapsedMs * refillPerMinute) / 60000);
  const tokens = Math.min(capacity, state.tokens + gained);
  return { ok: true, value: { tokens, lastRefillMs: nowMs } };
}

export interface TakeResult {
  state: BucketState;
  retryAfterMs: number | null;
}

// Consume `cost` tokens. On refusal, retryAfterMs says when one token (or
// the asked-for cost) will be available — honest backpressure, not a guess.
export function takeToken(
  state: BucketState,
  capacity: number,
  refillPerMinute: number,
  nowMs: number,
  cost: number,
): Verdict<TakeResult> {
  const ref = validateRefillPerMinute(refillPerMinute);
  if (!ref.ok) return ref;
  if (!Number.isInteger(cost) || cost < 1 || cost > MAX_COST) {
    return { ok: false, reason: 'rate-limit-invalid-cost' };
  }
  const filled = refillBucket(state, capacity, refillPerMinute, nowMs);
  if (!filled.ok) return filled;
  const tokens = filled.value.tokens;
  if (tokens >= cost) {
    return { ok: true, value: { state: { tokens: tokens - cost, lastRefillMs: nowMs }, retryAfterMs: null } };
  }
  // Refusal is by name; the caller's wait is derivable from the refill
  // rate (cost - tokens tokens short at refillPerMinute per minute).
  return { ok: false, reason: 'rate-limit-exceeded' };
}
