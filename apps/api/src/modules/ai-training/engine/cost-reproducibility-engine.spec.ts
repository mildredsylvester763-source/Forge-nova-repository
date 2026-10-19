// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/cost-reproducibility-engine.spec.ts
// ============================================================================
// Engine laws for the cost tracker (AI-019) and reproducible runs (AI-020).
// Pinned boundary vectors plus a 500-case mulberry32(seed 42) sweep.

import {
  openCostLedger,
  recordCost,
  reproducibilityFingerprint,
  RunConfig,
  Verdict,
} from './cost-reproducibility-engine';


/** Narrowing helper: strict TS forbids reading .reason on the ok-union. */
function reasonOf<T>(v: Verdict<T>): string {
  return v.ok ? '' : v.reason;
}
function valueOf<T>(v: Verdict<T>): T {
  if (!v.ok) throw new Error('unreachable');
  return v.value;
}
describe('cost-reproducibility-engine (AI-019/020)', () => {
  describe('openCostLedger', () => {
    it('opens a ledger with a positive budget', () => {
      const v = openCostLedger(10);
      expect(v).toEqual({ ok: true, value: { budget: 10, spent: 0, entries: [] } });
    });

    it('refuses zero, negative and missing budgets by name', () => {
      expect(reasonOf(openCostLedger(0))).toBe('cost-no-budget');
      expect(reasonOf(openCostLedger(-5))).toBe('cost-no-budget');
      expect(reasonOf(openCostLedger(NaN))).toBe('cost-no-budget');
    });
  });

  describe('recordCost', () => {
    it('accumulates spend and keeps the ledger immutable per event', () => {
      const led = openCostLedger(10);
      if (!led.ok) throw new Error('unreachable');
      const r1 = recordCost(led.value, { step: 0, units: 3 });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value.spent).toBe(3);
      const r2 = recordCost(valueOf(r1), { step: 1, units: 6 });
      expect(r2.ok).toBe(true);
      if (r2.ok) {
        expect(r2.value.spent).toBe(9);
        expect(r2.value.entries).toHaveLength(2);
      }
    });

    it('allows spending exactly to the cap', () => {
      const led = openCostLedger(10);
      if (!led.ok) throw new Error('unreachable');
      let cur = led.value;
      for (const [step, units] of [[0, 3], [1, 6], [2, 1]] as const) {
        const r = recordCost(cur, { step, units });
        expect(r.ok).toBe(true);
        if (r.ok) cur = r.value;
      }
      expect(cur.spent).toBe(10);
    });

    it('refuses the event that would cross the cap, by name', () => {
      const led = openCostLedger(10);
      if (!led.ok) throw new Error('unreachable');
      const r1 = recordCost(led.value, { step: 0, units: 3 });
      const r2 = r1.ok ? recordCost(r1.value, { step: 1, units: 6 }) : null;
      expect(r2?.ok).toBe(true);
      const over = r2 && r2.ok ? recordCost(r2.value, { step: 2, units: 2 }) : null;
      expect(over?.ok).toBe(false);
      expect(reasonOf(over as any)).toMatch(/^cost-budget-exceeded:/);
    });

    it('refuses malformed events and missing ledgers by name', () => {
      const led = openCostLedger(10);
      if (!led.ok) throw new Error('unreachable');
      expect(reasonOf(recordCost(led.value, { step: -1, units: 1 }))).toBe('cost-event-invalid-step');
      expect(reasonOf(recordCost(led.value, { step: 0.5, units: 1 } as any))).toBe('cost-event-invalid-step');
      expect(reasonOf(recordCost(led.value, { step: 0, units: 0 }))).toBe('cost-event-invalid-units');
      expect(reasonOf(recordCost(led.value, { step: 0, units: -1 }))).toBe('cost-event-invalid-units');
      expect(reasonOf(recordCost(undefined as any, { step: 0, units: 1 }))).toBe('cost-no-ledger');
    });
  });

  describe('reproducibilityFingerprint', () => {
    const cfg: RunConfig = {
      datasetFingerprint: 'dsfp_1',
      codeVersion: 'git-abc123',
      seed: 42,
      environment: 'colab-t4-lora',
      hyperparams: { lora_r: 16 },
    };

    it('fingerprints the pinned run config deterministically', () => {
      const a = reproducibilityFingerprint(cfg);
      const b = reproducibilityFingerprint({ ...cfg });
      expect(a.ok).toBe(true);
      expect(a).toEqual(b);
      if (a.ok) expect(a.value).toMatch(/^runfp_[0-9a-f]{8}$/);
    });

    it('changes when any pin changes (dataset, code, seed, env, hyperparams)', () => {
      const base = reproducibilityFingerprint(cfg);
      if (!base.ok) throw new Error('unreachable');
      const variants: RunConfig[] = [
        { ...cfg, datasetFingerprint: 'dsfp_2' },
        { ...cfg, codeVersion: 'git-def456' },
        { ...cfg, seed: 43 },
        { ...cfg, environment: 'kaggle-l4' },
        { ...cfg, hyperparams: { lora_r: 32 } },
      ];
      for (const v of variants) {
        const fp = reproducibilityFingerprint(v);
        expect(fp.ok).toBe(true);
        if (fp.ok) expect(fp.value).not.toBe(base.value);
      }
    });

    it('refuses incomplete configs by name', () => {
      expect(reasonOf(reproducibilityFingerprint(null as any))).toBe('run-config-missing');
      expect(reasonOf(reproducibilityFingerprint({ codeVersion: 'x', seed: 1, environment: 'y' } as any))).toBe('run-config-no-dataset');
      expect(reasonOf(reproducibilityFingerprint({ datasetFingerprint: 'd', codeVersion: 'x', seed: -1, environment: 'y' } as any))).toBe('run-config-invalid-seed');
      expect(reasonOf(reproducibilityFingerprint({ datasetFingerprint: 'd', codeVersion: 'x', seed: 1.5, environment: 'y' } as any))).toBe('run-config-invalid-seed');
      expect(reasonOf(reproducibilityFingerprint({ datasetFingerprint: 'd', seed: 1, environment: 'y' } as any))).toBe('run-config-no-code-version');
      expect(reasonOf(reproducibilityFingerprint({ datasetFingerprint: 'd', codeVersion: 'x', seed: 1 } as any))).toBe('run-config-no-environment');
    });
  });

  // ---- 500-case deterministic sweep ----
  describe('mulberry32(seed 42) sweep — 500 cases', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    it('holds every invariant across 500 randomized cases', () => {
      const rand = mulberry32(42);
      let caps = 0, spends = 0;
      for (let i = 0; i < 500; i++) {
        const budget = 0.5 + rand() * 20;
        const led = openCostLedger(budget);
        expect(led.ok).toBe(true);
        if (!led.ok) continue;
        let ledger = led.value;
        for (let s = 0; s < 20; s++) {
          const units = 0.01 + rand() * 2;
          const r = recordCost(ledger, { step: s, units });
          if (r.ok) {
            spends++;
            ledger = r.value;
            // invariant: spend never exceeds the cap
            expect(ledger.spent).toBeLessThanOrEqual(budget + 1e-9);
          } else {
            caps++;
            expect(r.reason.startsWith('cost-budget-exceeded:')).toBe(true);
            break;
          }
        }
        const c: RunConfig = {
          datasetFingerprint: 'ds_' + i,
          codeVersion: 'v' + i,
          seed: Math.floor(rand() * 100000),
          environment: 'env' + (i % 7),
          hyperparams: { lr: rand() },
        };
        // invariant: fingerprints are deterministic and well-formed
        expect(reproducibilityFingerprint(c)).toEqual(reproducibilityFingerprint({ ...c }));
        expect(reproducibilityFingerprint(c).ok).toBe(true);
      }
      expect(caps).toBeGreaterThan(0);
      expect(spends).toBeGreaterThan(0);
    });
  });
});
