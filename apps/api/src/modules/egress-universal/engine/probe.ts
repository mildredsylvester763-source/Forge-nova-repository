// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/probe.ts
// ============================================================================
// Connection health. A probe is one honest question to a destination:
// are you alive? Latency bands, consecutive-failure thresholds and
// recovery discipline are pinned here. Pure: no DB, no clock.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export type HealthStatus = 'healthy' | 'degraded' | 'down';

export const FAILURE_THRESHOLD = 3;

export function classifyLatency(latencyMs: number): Verdict<{ band: 'fast' | 'ok' | 'slow'; status: HealthStatus }> {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return { ok: false, reason: 'probe-invalid-latency' };
  if (latencyMs > 30000) return { ok: false, reason: 'probe-latency-out-of-range' };
  if (latencyMs <= 800) return { ok: true, value: { band: 'fast', status: 'healthy' } };
  if (latencyMs <= 3000) return { ok: true, value: { band: 'ok', status: 'healthy' } };
  return { ok: true, value: { band: 'slow', status: 'degraded' } };
}

export interface ProbeOutcome {
  status: HealthStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

// Probe cadence verdict: after a failure, probe more aggressively; after
// sustained success, back off. Returns the recommended number of minutes
// until the next probe.
export function nextProbeMinutes(consecutiveFailures: number, consecutiveSuccesses: number): Verdict<{ minutes: number }> {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 0) {
    return { ok: false, reason: 'probe-invalid-failure-count' };
  }
  if (!Number.isInteger(consecutiveSuccesses) || consecutiveSuccesses < 0) {
    return { ok: false, reason: 'probe-invalid-success-count' };
  }
  if (consecutiveFailures > 0) return { ok: true, value: { minutes: 5 } };
  if (consecutiveSuccesses >= 10) return { ok: true, value: { minutes: 1440 } };
  if (consecutiveSuccesses >= 3) return { ok: true, value: { minutes: 360 } };
  return { ok: true, value: { minutes: 60 } };
}

export function applyProbeResult(
  consecutiveFailures: number,
  consecutiveSuccesses: number,
  succeeded: boolean,
): Verdict<ProbeOutcome> {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 0) {
    return { ok: false, reason: 'probe-invalid-failure-count' };
  }
  if (!Number.isInteger(consecutiveSuccesses) || consecutiveSuccesses < 0) {
    return { ok: false, reason: 'probe-invalid-success-count' };
  }
  const failures = succeeded ? 0 : consecutiveFailures + 1;
  const successes = succeeded ? consecutiveSuccesses + 1 : 0;
  const status: HealthStatus =
    failures >= FAILURE_THRESHOLD ? 'down' : failures > 0 ? 'degraded' : 'healthy';
  return { ok: true, value: { status, consecutiveFailures: failures, consecutiveSuccesses: successes } };
}
