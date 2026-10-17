// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/probe.spec.ts
// ============================================================================
import { FAILURE_THRESHOLD, classifyLatency, nextProbeMinutes, applyProbeResult } from './probe';

describe('probe (destination health)', () => {
  it('pins the failure threshold', () => {
    expect(FAILURE_THRESHOLD).toBe(3);
  });

  it('bands latency into health statuses', () => {
    const fast = classifyLatency(200);
    expect(fast.ok).toBe(true);
    if (fast.ok) {
      expect(fast.value.band).toBe('fast');
      expect(fast.value.status).toBe('healthy');
    }
    const ok = classifyLatency(1500);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.band).toBe('ok');
      expect(ok.value.status).toBe('healthy');
    }
    const slow = classifyLatency(5000);
    expect(slow.ok).toBe(true);
    if (slow.ok) {
      expect(slow.value.band).toBe('slow');
      expect(slow.value.status).toBe('degraded');
    }
    expect(classifyLatency(40000).ok).toBe(false);
  });

  it('schedules probe cadence by failure/success streaks', () => {
    expect(nextProbeMinutes(1, 0).value.minutes).toBe(5);
    expect(nextProbeMinutes(0, 0).value.minutes).toBe(60);
    expect(nextProbeMinutes(0, 3).value.minutes).toBe(360);
    expect(nextProbeMinutes(0, 10).value.minutes).toBe(1440);
  });

  it('marks a destination down on the third consecutive failure', () => {
    const v = applyProbeResult(2, 5, false);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.status).toBe('down');
      expect(v.value.consecutiveFailures).toBe(3);
      expect(v.value.consecutiveSuccesses).toBe(0);
    }
  });

  it('resets the streak on a success', () => {
    const v = applyProbeResult(3, 0, true);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.status).toBe('healthy');
      expect(v.value.consecutiveFailures).toBe(0);
      expect(v.value.consecutiveSuccesses).toBe(1);
    }
  });

  it('keeps a destination healthy on sustained success', () => {
    const v = applyProbeResult(0, 2, true);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.status).toBe('healthy');
  });

  it('refuses negative streaks', () => {
    const v = applyProbeResult(-1, 0, true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('probe-invalid-failure-count');
  });
});
