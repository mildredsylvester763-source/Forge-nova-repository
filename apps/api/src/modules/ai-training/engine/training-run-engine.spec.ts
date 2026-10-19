// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/training-run-engine.spec.ts
// ============================================================================
// Engine laws for training runs (AI-013/014/017). Pinned boundary vectors plus
// a 500-case mulberry32(seed 42) sweep: every case asserts the same invariants
// the pinned vectors establish, so regressions cannot hide behind averages.

import {
  buildPlan,
  canTransition,
  computeResume,
  compareExperiments,
  validateMetricSeries,
  RUN_STATES,
  PLAN_DEFAULTS,
  Checkpoint,
  MetricPoint,
} from './training-run-engine';

describe('training-run-engine (AI-013/014/017)', () => {
  // ---- AI-013: run planning ----
  describe('buildPlan', () => {
    it('builds a deterministic plan with defaults', () => {
      const v = buildPlan({ datasetFingerprint: 'dsfp_0001', itemCount: 100, budget: 1000, costPerStep: 1 });
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.value.epochs).toBe(PLAN_DEFAULTS.epochs);
        expect(v.value.batchSize).toBe(PLAN_DEFAULTS.batchSize);
        // ceil(100/32)=4 steps per epoch, 3 epochs => 12 steps, cost 12.
        expect(v.value.steps).toBe(12);
        expect(v.value.estimatedCost).toBe(12);
        expect(v.value.withinBudget).toBe(true);
      }
    });

    it('rounds steps up per epoch (partial batch still trains)', () => {
      const v = buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 33, epochs: 1, batchSize: 32, budget: 5, costPerStep: 1 });
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.steps).toBe(2);
    });

    it('refuses empty fingerprint by name', () => {
      expect(buildPlan({ datasetFingerprint: '', itemCount: 10, budget: 10, costPerStep: 1 })).toEqual({
        ok: false,
        reason: 'plan-no-fingerprint',
      });
    });

    it('refuses zero items by name', () => {
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 0, budget: 10, costPerStep: 1 })).toEqual({
        ok: false,
        reason: 'plan-no-items',
      });
    });

    it('pins epoch and batch bounds', () => {
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, epochs: 0, budget: 10, costPerStep: 1 }).reason).toBe('plan-invalid-epochs');
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, epochs: 101, budget: 10, costPerStep: 1 }).reason).toBe('plan-invalid-epochs');
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, epochs: 1.5, budget: 10, costPerStep: 1 }).reason).toBe('plan-invalid-epochs');
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, batchSize: 0, budget: 10, costPerStep: 1 }).reason).toBe('plan-invalid-batch-size');
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, batchSize: 513, budget: 10, costPerStep: 1 }).reason).toBe('plan-invalid-batch-size');
    });

    it('refuses over-budget plans loudly, never silently trims', () => {
      const v = buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 100, epochs: 10, batchSize: 32, budget: 1, costPerStep: 1 });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/^plan-budget-refused:/);
    });

    it('refuses free training and missing budget by name', () => {
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, budget: 10, costPerStep: 0 }).reason).toBe('plan-invalid-cost');
      expect(buildPlan({ datasetFingerprint: 'dsfp_1', itemCount: 10, budget: 0, costPerStep: 1 }).reason).toBe('plan-no-budget');
    });

    it('is deterministic: identical input yields identical plan', () => {
      const a = buildPlan({ datasetFingerprint: 'dsfp_7', itemCount: 77, epochs: 4, batchSize: 16, budget: 999, costPerStep: 0.5 });
      const b = buildPlan({ datasetFingerprint: 'dsfp_7', itemCount: 77, epochs: 4, batchSize: 16, budget: 999, costPerStep: 0.5 });
      expect(a).toEqual(b);
    });
  });

  // ---- AI-014: lifecycle state machine ----
  describe('canTransition', () => {
    it('pins the legal transition table', () => {
      expect(canTransition({ from: 'planned', to: 'running' }).ok).toBe(true);
      expect(canTransition({ from: 'planned', to: 'canceled' }).ok).toBe(true);
      expect(canTransition({ from: 'running', to: 'paused' }).ok).toBe(true);
      expect(canTransition({ from: 'running', to: 'succeeded' }).ok).toBe(true);
      expect(canTransition({ from: 'running', to: 'failed' }).ok).toBe(true);
      expect(canTransition({ from: 'paused', to: 'running' }).ok).toBe(true);
      expect(canTransition({ from: 'paused', to: 'canceled' }).ok).toBe(true);
    });

    it('refuses teleports and revives by name', () => {
      expect(canTransition({ from: 'planned', to: 'succeeded' }).reason).toBe('run-illegal-transition:planned->succeeded');
      expect(canTransition({ from: 'planned', to: 'paused' }).reason).toBe('run-illegal-transition:planned->paused');
      expect(canTransition({ from: 'succeeded', to: 'running' }).reason).toBe('run-illegal-transition:succeeded->running');
      expect(canTransition({ from: 'failed', to: 'running' }).reason).toBe('run-illegal-transition:failed->running');
      expect(canTransition({ from: 'canceled', to: 'planned' }).reason).toBe('run-illegal-transition:canceled->planned');
    });

    it('refuses unknown states by name', () => {
      expect(canTransition({ from: 'dreaming' as any, to: 'running' }).reason).toBe('run-unknown-state:dreaming');
      expect(canTransition({ from: 'planned', to: 'rebooted' as any }).reason).toBe('run-unknown-state:rebooted');
    });
  });

  describe('computeResume', () => {
    const cp: Checkpoint = { step: 5, sequence: 2, loss: 0.4, savedAt: '2026-10-19T00:00:00Z' };
    it('resumes a paused run from its checkpoint', () => {
      const v = computeResume({ state: 'paused', checkpoint: cp, planSteps: 10 });
      expect(v).toEqual({ ok: true, value: { step: 5, sequence: 2 } });
    });

    it('refuses resume for any state but paused', () => {
      for (const s of ['planned', 'running', 'succeeded', 'failed', 'canceled'] as const) {
        expect(computeResume({ state: s, checkpoint: cp, planSteps: 10 }).reason).toBe('resume-not-paused:' + s);
      }
    });

    it('refuses resume without a checkpoint', () => {
      expect(computeResume({ state: 'paused', checkpoint: null, planSteps: 10 }).reason).toBe('resume-no-checkpoint');
    });

    it('refuses malformed checkpoints by name', () => {
      expect(computeResume({ state: 'paused', checkpoint: { ...cp, step: -1 }, planSteps: 10 }).reason).toBe('resume-checkpoint-invalid:step');
      expect(computeResume({ state: 'paused', checkpoint: { ...cp, step: 1.5 }, planSteps: 10 }).reason).toBe('resume-checkpoint-invalid:step');
      expect(computeResume({ state: 'paused', checkpoint: { ...cp, sequence: 0 }, planSteps: 10 }).reason).toBe('resume-checkpoint-invalid:sequence');
    });

    it('refuses checkpoints past the plan (nothing left to run)', () => {
      expect(computeResume({ state: 'paused', checkpoint: { ...cp, step: 10 }, planSteps: 10 }).reason).toBe('resume-checkpoint-past-plan:10>=10');
      expect(computeResume({ state: 'paused', checkpoint: cp, planSteps: 0 }).reason).toBe('resume-checkpoint-past-plan:no-plan');
    });
  });

  // ---- AI-017: experiment tracking ----
  describe('compareExperiments', () => {
    it('prefers eval score when both runs have one', () => {
      const v = compareExperiments({
        a: { runId: 'run-a', finalLoss: 0.2, bestEvalScore: 0.8, steps: 10 },
        b: { runId: 'run-b', finalLoss: 0.1, bestEvalScore: 0.7, steps: 10 },
      });
      expect(v).toEqual({ ok: true, value: { winner: 'run-a', margin: 0.1, basis: 'eval-score' } });
    });

    it('falls back to final loss (lower wins) when eval is missing', () => {
      const v = compareExperiments({
        a: { runId: 'run-a', finalLoss: 0.5, steps: 10 },
        b: { runId: 'run-b', finalLoss: 0.3, steps: 10 },
      });
      expect(v).toEqual({ ok: true, value: { winner: 'run-b', margin: 0.2, basis: 'final-loss' } });
    });

    it('refuses ghost and corrupt runs by name', () => {
      expect(compareExperiments({ a: { runId: '', finalLoss: 1 }, b: { runId: 'b', finalLoss: 1 } } as any).reason).toBe('compare-missing-run');
      expect(compareExperiments({ a: { runId: 'a', finalLoss: NaN }, b: { runId: 'b', finalLoss: 1 } }).reason).toBe('compare-invalid-loss:a');
    });
  });

  describe('validateMetricSeries', () => {
    it('accepts ordered, finite series', () => {
      const pts: MetricPoint[] = [
        { step: 0, loss: 1.0 },
        { step: 1, loss: 0.5, evalScore: 0.6 },
        { step: 2, loss: 0.4 },
      ];
      expect(validateMetricSeries(pts).ok).toBe(true);
    });

    it('refuses empty and disordered series by name', () => {
      expect(validateMetricSeries([]).reason).toBe('metrics-empty');
      expect(validateMetricSeries([{ step: 1, loss: 1 }, { step: 1, loss: 1 }]).reason).toBe('metrics-step-disorder:step 1');
      expect(validateMetricSeries([{ step: 5, loss: 1 }, { step: 3, loss: 1 }]).reason).toBe('metrics-step-disorder:step 3');
      expect(validateMetricSeries([{ step: -1, loss: 1 }]).reason).toBe('metrics-step-disorder:step -1');
      expect(validateMetricSeries([{ step: 0, loss: NaN }]).reason).toBe('metrics-invalid-loss:step 0');
      expect(validateMetricSeries([{ step: 0, loss: 1, evalScore: Infinity }]).reason).toBe('metrics-invalid-eval:step 0');
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
      let plans = 0, refusals = 0, resumes = 0;
      for (let i = 0; i < 500; i++) {
        const itemCount = 1 + Math.floor(rand() * 2000);
        const epochs = 1 + Math.floor(rand() * 100);
        const batchSize = 1 + Math.floor(rand() * 512);
        const costPerStep = 0.01 + rand() * 2;
        const budget = rand() < 0.5 ? rand() * 5000 : rand() * 20;
        const v = buildPlan({ datasetFingerprint: 'dsfp_' + i, itemCount, epochs, batchSize, budget, costPerStep });
        if (v.ok) {
          plans++;
          const p = v.value;
          // invariant: steps = ceil(items/batch) * epochs, always
          expect(p.steps).toBe(Math.ceil(itemCount / batchSize) * epochs);
          // invariant: cost = steps * costPerStep, within budget, rounded to 1e-6
          expect(p.estimatedCost).toBeLessThanOrEqual(budget + 1e-9);
          expect(Math.abs(p.estimatedCost - p.steps * costPerStep)).toBeLessThan(1e-6);
        } else {
          refusals++;
          expect(v.reason.startsWith('plan-')).toBe(true);
        }

        // lifecycle sweep: random transitions are either legal or named refusals
        const from = RUN_STATES[Math.floor(rand() * RUN_STATES.length)];
        const to = RUN_STATES[Math.floor(rand() * RUN_STATES.length)];
        const t = canTransition({ from, to });
        if (t.ok) expect(t.value).toBe(to);
        else expect(t.reason.startsWith('run-')).toBe(true);

        // resume sweep
        const state = rand() < 0.5 ? 'paused' : RUN_STATES[Math.floor(rand() * RUN_STATES.length)];
        const cp: Checkpoint = { step: Math.floor(rand() * 50), sequence: 1 + Math.floor(rand() * 10), loss: rand(), savedAt: 't' };
        const r = computeResume({ state, checkpoint: cp, planSteps: Math.floor(rand() * 50) + 1 });
        if (r.ok) {
          resumes++;
          expect(r.value.step).toBe(cp.step);
          expect(r.value.sequence).toBe(cp.sequence);
        } else expect(r.reason.startsWith('resume-')).toBe(true);

        // metric sweep: monotone series always pass, reversals never do silently
        const n = 1 + Math.floor(rand() * 20);
        const pts: MetricPoint[] = [];
        let loss = rand() * 2;
        for (let s = 0; s < n; s++) {
          loss = Math.max(0, loss - rand() * 0.1);
          pts.push({ step: s, loss, evalScore: rand() });
        }
        expect(validateMetricSeries(pts).ok).toBe(true);
        if (n > 1) {
          expect(validateMetricSeries(pts.slice().reverse()).ok).toBe(false);
        }
      }
      // The sweep must exercise both sides of every gate.
      expect(plans).toBeGreaterThan(0);
      expect(refusals).toBeGreaterThan(0);
      expect(resumes).toBeGreaterThan(0);
    });
  });
});
