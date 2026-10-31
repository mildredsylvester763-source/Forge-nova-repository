import {
  previewPlan,
  RISK_BY_ACTION,
  COST_BY_ACTION,
} from './plan-preview';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('plan-preview engine (FORGE AI-075)', () => {
  it('previews cost, risk and files for a plan that touches one report', () => {
    const out = previewPlan({
      steps: [
        { action: 'search' },
        { action: 'write', file: 'report.md' },
        { action: 'run', file: 'report.md' },
      ],
    });
    expect(out).toEqual({
      ok: true,
      stepCount: 3,
      filesTouched: ['report.md'],
      risk: 'high',
      estimatedCost: 2200,
      requiresApproval: true,
    });
  });

  it('keeps low risk plans approval free', () => {
    const out = previewPlan({ steps: [{ action: 'search' }, { action: 'verify' }] });
    expect(out).toEqual({
      ok: true,
      stepCount: 2,
      filesTouched: [],
      risk: 'low',
      estimatedCost: 700,
      requiresApproval: false,
    });
  });

  it('dedupes files in first-seen order', () => {
    const out = previewPlan({
      steps: [
        { action: 'search', file: 'a.md' },
        { action: 'write', file: 'b.md' },
        { action: 'write', file: 'a.md' },
      ],
    });
    expect(out.filesTouched).toEqual(['a.md', 'b.md']);
    expect(out.estimatedCost).toBe(2800);
    expect(out.risk).toBe('medium');
    expect(out.requiresApproval).toBe(false);
  });

  it('refuses empty and unknown-action steps and exposes the cost tables', () => {
    expect(previewPlan({ steps: [] })).toMatchObject({ reason: 'preview-steps-empty' });
    expect(previewPlan({ steps: [{ file: 'a.md' }] })).toMatchObject({
      reason: 'preview-step-action-missing',
    });
    expect(previewPlan({ steps: [{ action: 'teleport' }] })).toMatchObject({
      reason: 'preview-step-action-unknown:teleport',
    });
    expect(RISK_BY_ACTION.run).toBe('high');
    expect(RISK_BY_ACTION.write).toBe('medium');
    expect(COST_BY_ACTION.write).toBe(1200);
    expect(COST_BY_ACTION.present).toBe(200);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const ACTIONS = ['search', 'write', 'run', 'verify', 'present'];
    const FILES = ['a.md', 'b.md', ' a.md ', '  ', '', 'c.ts'];
    for (let c = 0; c < 500; c++) {
      const n = Math.floor(rand() * 8);
      const steps: Array<Record<string, unknown>> = [];
      for (let i = 0; i < n; i++) {
        const step: Record<string, unknown> = {};
        const pick = rand();
        if (pick < 0.7) step.action = ACTIONS[Math.floor(rand() * ACTIONS.length)];
        else if (pick < 0.85) step.action = ['dance', 'teleport', ''][Math.floor(rand() * 3)];
        const fpick = rand();
        if (fpick < 0.5) step.file = FILES[Math.floor(rand() * FILES.length)];
        steps.push(step);
      }
      const got = previewPlan({ steps });
      const COSTS: Record<string, number> = {
        search: 400,
        write: 1200,
        run: 600,
        verify: 300,
        present: 200,
      };
      const RANK: Record<string, string> = {
        search: 'low',
        write: 'medium',
        run: 'high',
        verify: 'low',
        present: 'low',
      };
      const LEVEL: Record<string, number> = { low: 0, medium: 1, high: 2 };
      let expOk = true;
      let expReason = '';
      let expCost = 0;
      let expRisk = 'low';
      const expFiles: string[] = [];
      if (steps.length === 0) {
        expOk = false;
        expReason = 'preview-steps-empty';
      } else {
        for (const s of steps) {
          const a = typeof s.action === 'string' ? s.action.trim().toLowerCase() : '';
          if (a.length === 0) {
            expOk = false;
            expReason = 'preview-step-action-missing';
            break;
          }
          if (!(a in COSTS)) {
            expOk = false;
            expReason = 'preview-step-action-unknown:' + a;
            break;
          }
          expCost += COSTS[a];
          if (LEVEL[RANK[a]] > LEVEL[expRisk]) expRisk = RANK[a];
          if (typeof s.file === 'string' && s.file.trim().length > 0) {
            const f = s.file.trim();
            if (!expFiles.includes(f)) expFiles.push(f);
          }
        }
      }
      expect(got.ok).toBe(expOk);
      if (expOk) {
        expect(got.stepCount).toBe(steps.length);
        expect(got.filesTouched).toEqual(expFiles);
        expect(got.risk).toBe(expRisk);
        expect(got.estimatedCost).toBe(expCost);
        expect(got.requiresApproval).toBe(expRisk === 'high');
      } else {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });
});
