// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/circuit-breaker.ts
// ============================================================================
// Per-destination circuit breaker: closed -> open (after a failure streak)
// -> half-open (after a cooldown) -> closed (on success) or open again (on
// failure). Pure state machine: the service owns the Map, the engine owns
// every transition. Refusals are named. Pure: no DB, no clock.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerSnapshot {
  state: BreakerState;
  failures: number;
  successes: number;
  openedAtMs: number | null;
  lastResultAtMs: number | null;
}

export const BREAKER_FAILURE_THRESHOLD = 5;
export const BREAKER_COOLDOWN_MS = 60000;

export function initialBreaker(): BreakerSnapshot {
  return { state: 'closed', failures: 0, successes: 0, openedAtMs: null, lastResultAtMs: null };
}

function validateSnapshot(s: BreakerSnapshot): Verdict<null | BreakerSnapshot> {
  if (!s || typeof s !== 'object') return { ok: false, reason: 'breaker-invalid-snapshot' };
  if (s.state !== 'closed' && s.state !== 'open' && s.state !== 'half-open') {
    return { ok: false, reason: 'breaker-invalid-state' };
  }
  if (!Number.isInteger(s.failures) || s.failures < 0) return { ok: false, reason: 'breaker-invalid-failures' };
  if (!Number.isInteger(s.successes) || s.successes < 0) return { ok: false, reason: 'breaker-invalid-successes' };
  if (s.state === 'open' && !Number.isInteger(s.openedAtMs)) return { ok: false, reason: 'breaker-invalid-opened-at' };
  if (s.state !== 'open' && s.openedAtMs !== null) return { ok: false, reason: 'breaker-stray-opened-at' };
  if (s.lastResultAtMs !== null && (!Number.isInteger(s.lastResultAtMs) || s.lastResultAtMs < 0)) {
    return { ok: false, reason: 'breaker-invalid-last-result-at' };
  }
  return { ok: true, value: s };
}

export interface AttemptDecision {
  allowed: boolean;
  state: BreakerState;
  retryAfterMs: number | null;
}

// Is a request allowed right now? An open breaker refuses by name; once
// the cooldown has elapsed it moves to half-open and allows ONE probe.
export function canAttempt(
  snapshot: BreakerSnapshot,
  nowMs: number,
  cooldownMs: number,
): Verdict<AttemptDecision> {
  const valid = validateSnapshot(snapshot);
  if (!valid.ok) return valid;
  if (!Number.isInteger(nowMs) || nowMs < 0) return { ok: false, reason: 'breaker-invalid-now' };
  if (!Number.isInteger(cooldownMs) || cooldownMs < 0) return { ok: false, reason: 'breaker-invalid-cooldown' };
  if (snapshot.state === 'closed') {
    return { ok: true, value: { allowed: true, state: 'closed', retryAfterMs: null } };
  }
  if (snapshot.state === 'open') {
    const elapsed = nowMs - (snapshot.openedAtMs as number);
    if (elapsed < 0) return { ok: false, reason: 'breaker-clock-went-backwards' };
    if (elapsed >= cooldownMs) {
      return { ok: true, value: { allowed: true, state: 'half-open', retryAfterMs: null } };
    }
    return {
      ok: false,
      reason: 'circuit-breaker-open',
    };
  }
  // half-open: one probe in flight is allowed; the verdict after that
  // probe decides whether the breaker closes or re-opens.
  return { ok: true, value: { allowed: true, state: 'half-open', retryAfterMs: null } };
}

export function recordResult(
  snapshot: BreakerSnapshot,
  succeeded: boolean,
  nowMs: number,
): Verdict<BreakerSnapshot> {
  const valid = validateSnapshot(snapshot);
  if (!valid.ok) return valid;
  if (!Number.isInteger(nowMs) || nowMs < 0) return { ok: false, reason: 'breaker-invalid-now' };
  if (succeeded) {
    return {
      ok: true,
      value: { state: 'closed', failures: 0, successes: snapshot.successes + 1, openedAtMs: null, lastResultAtMs: nowMs },
    };
  }
  const failures = snapshot.failures + 1;
  const tripped = failures >= BREAKER_FAILURE_THRESHOLD;
  return {
    ok: true,
    value: {
      state: tripped ? 'open' : 'closed',
      failures,
      successes: 0,
      openedAtMs: tripped ? nowMs : null,
      lastResultAtMs: nowMs,
    },
  };
}
