import { planTask, editPlan, PLAN_ACTIONS } from './task-planner';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('task-planner engine (FORGE AI-074)', () => {
  it('plans a shippable report goal as a sequenced step chain', () => {
    const out = planTask({
      goal: 'ship the report',
      steps: [
        { action: 'search' },
        { action: 'write', detail: 'draft the report' },
        { action: 'present' },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.goal).toBe('ship the report');
    expect(out.steps).toEqual([
      { id: 's1', action: 'search', detail: 'search', dependsOn: [] },
      { id: 's2', action: 'write', detail: 'draft the report', dependsOn: ['s1'] },
      { id: 's3', action: 'present', detail: 'present', dependsOn: ['s2'] },
    ]);
  });

  it('refuses bad goals, limits and actions with named reasons', () => {
    expect(planTask({ steps: [{ action: 'search' }] })).toMatchObject({
      reason: 'plan-goal-missing',
    });
    expect(planTask({ goal: 'g'.repeat(501), steps: [{ action: 'search' }] })).toMatchObject({
      reason: 'plan-goal-too-long',
    });
    expect(planTask({ goal: 'g' })).toMatchObject({ reason: 'plan-steps-empty' });
    expect(
      planTask({ goal: 'g', steps: Array.from({ length: 21 }, () => ({ action: 'search' })) }),
    ).toMatchObject({ reason: 'plan-steps-limit:21' });
    expect(planTask({ goal: 'g', steps: [{ detail: 'x' }] })).toMatchObject({
      reason: 'plan-step-action-missing',
    });
    expect(planTask({ goal: 'g', steps: [{ action: 'dance' }] })).toMatchObject({
      reason: 'plan-step-action-unknown:dance',
    });
  });

  it('edits plans with insert, remove and move and re-sequences ids', () => {
    const base = [
      { id: 's1', action: 'search' },
      { id: 's2', action: 'write' },
      { id: 's3', action: 'present' },
    ];
    const rm = editPlan({ steps: base, edits: [{ op: 'remove', id: 's2' }] });
    expect(rm.steps?.map((s) => s.action)).toEqual(['search', 'present']);
    expect(rm.steps?.map((s) => s.id)).toEqual(['s1', 's2']);
    const mv = editPlan({ steps: base, edits: [{ op: 'move', id: 's1', toIndex: 2 }] });
    expect(mv.steps?.map((s) => s.action)).toEqual(['write', 'present', 'search']);
    const ins = editPlan({
      steps: [base[0]],
      edits: [{ op: 'insert', index: 1, step: { action: 'verify' } }],
    });
    expect(ins.steps?.map((s) => s.action)).toEqual(['search', 'verify']);
    expect(editPlan({ steps: base, edits: [{ op: 'remove', id: 's9' }] })).toMatchObject({
      reason: 'plan-edit-id-unknown:s9',
    });
    expect(editPlan({ steps: base, edits: [{ op: 'move', id: 's1', toIndex: 5 }] })).toMatchObject({
      reason: 'plan-edit-target-invalid:5',
    });
    expect(editPlan({ steps: base, edits: [{ op: 'delete', id: 's1' }] })).toMatchObject({
      reason: 'plan-edit-op-unknown:delete',
    });
    expect(
      editPlan({
        steps: [{ action: 'search' }],
        edits: [{ op: 'insert', index: 0, step: { action: 'verify' } }],
      }),
    ).toMatchObject({ reason: 'plan-edit-step-id-missing' });
    expect(
      editPlan({
        steps: [
          { id: 's1', action: 'search' },
          { id: 's1', action: 'write' },
        ],
        edits: [{ op: 'remove', id: 's1' }],
      }),
    ).toMatchObject({ reason: 'plan-edit-step-duplicate:s1' });
    expect(editPlan({ steps: base, edits: [] })).toMatchObject({ reason: 'plan-edits-empty' });
    expect(
      editPlan({
        steps: base,
        edits: [
          { op: 'remove', id: 's1' },
          { op: 'remove', id: 's2' },
          { op: 'remove', id: 's3' },
        ],
      }),
    ).toMatchObject({ reason: 'plan-edit-result-empty' });
    expect(
      editPlan({ steps: base, edits: [{ op: 'insert', index: 9, step: { action: 'verify' } }] }),
    ).toMatchObject({ reason: 'plan-edit-index-invalid:9' });
    expect(editPlan({ steps: base, edits: [{ op: 'insert', index: 0 }] })).toMatchObject({
      reason: 'plan-edit-step-missing',
    });
    expect(
      editPlan({ steps: base, edits: [{ op: 'insert', index: 0, step: { action: 'dance' } }] }),
    ).toMatchObject({ reason: 'plan-step-action-unknown:dance' });
    expect(editPlan({ steps: base, edits: [{ op: 'remove' }] })).toMatchObject({
      reason: 'plan-edit-id-unknown:missing',
    });
  });

  it('matches an independent oracle on 500 mulberry32(42) planned cases', () => {
    const rand = mulberry32(42);
    const ORACLE_ACTIONS = ['search', 'write', 'run', 'verify', 'present'];
    for (let c = 0; c < 500; c++) {
      const kind = rand();
      let goal: string;
      if (kind < 0.05) {
        goal = '';
      } else if (kind < 0.08) {
        goal = 'g'.repeat(501 + Math.floor(rand() * 40));
      } else {
        goal = 'goal ' + c;
      }
      const n = Math.floor(rand() * 24);
      const steps: Array<Record<string, unknown>> = [];
      for (let i = 0; i < n; i++) {
        const pick = rand();
        const action =
          pick < 0.75
            ? PLAN_ACTIONS[Math.floor(rand() * PLAN_ACTIONS.length)]
            : pick < 0.9
              ? ['dance', 'jump', ''][Math.floor(rand() * 3)]
              : 'run';
        const step: Record<string, unknown> = {};
        if (action.length > 0) step.action = action;
        if (rand() < 0.3) step.detail = 'd' + Math.floor(rand() * 5);
        steps.push(step);
      }
      const got = planTask({ goal, steps });
      let expOk = true;
      let expReason = '';
      if (goal.trim().length === 0) {
        expOk = false;
        expReason = 'plan-goal-missing';
      } else if (goal.length > 500) {
        expOk = false;
        expReason = 'plan-goal-too-long';
      } else if (steps.length === 0) {
        expOk = false;
        expReason = 'plan-steps-empty';
      } else if (steps.length > 20) {
        expOk = false;
        expReason = 'plan-steps-limit:' + steps.length;
      } else {
        for (const s of steps) {
          const a = typeof s.action === 'string' ? s.action.trim().toLowerCase() : '';
          if (a.length === 0) {
            expOk = false;
            expReason = 'plan-step-action-missing';
            break;
          }
          if (!ORACLE_ACTIONS.includes(a)) {
            expOk = false;
            expReason = 'plan-step-action-unknown:' + a;
            break;
          }
        }
      }
      expect(got.ok).toBe(expOk);
      if (expOk) {
        const expSteps = steps.map((s, i) => {
          const a = String(s.action).trim().toLowerCase();
          const d = typeof s.detail === 'string' && s.detail.trim().length > 0 ? s.detail.trim() : a;
          return { id: 's' + (i + 1), action: a, detail: d, dependsOn: i === 0 ? [] : ['s' + i] };
        });
        expect(got.steps).toEqual(expSteps);
        expect(got.goal).toBe(goal.trim());
      } else {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });

  it('matches an independent oracle on 500 mulberry32(42) edited cases', () => {
    const rand = mulberry32(42);
    const ORACLE_ACTIONS = ['search', 'write', 'run', 'verify', 'present'];
    for (let c = 0; c < 500; c++) {
      const n = 1 + Math.floor(rand() * 6);
      const steps: Array<Record<string, unknown>> = [];
      for (let i = 0; i < n; i++) {
        const step: Record<string, unknown> = {
          id: 's' + (i + 1),
          action: ORACLE_ACTIONS[Math.floor(rand() * ORACLE_ACTIONS.length)],
        };
        if (rand() < 0.2) step.detail = 'd' + i;
        steps.push(step);
      }
      if (rand() < 0.06) steps[0].id = '';
      else if (rand() < 0.06) steps[n - 1].id = 's1';
      else if (rand() < 0.05) delete steps[0].action;
      else if (rand() < 0.05) steps[0].action = 'dance';
      const en = 1 + Math.floor(rand() * 3);
      const edits: Array<Record<string, unknown>> = [];
      for (let i = 0; i < en; i++) {
        const t = rand();
        if (t < 0.33) {
          edits.push({
            op: 'insert',
            index: Math.floor(rand() * (n + 2)),
            step: rand() < 0.85 ? { action: ORACLE_ACTIONS[Math.floor(rand() * 5)] } : undefined,
          });
        } else if (t < 0.66) {
          edits.push({ op: 'remove', id: 's' + (1 + Math.floor(rand() * (n + 2))) });
        } else {
          edits.push({
            op: 'move',
            id: 's' + (1 + Math.floor(rand() * (n + 1))),
            toIndex: Math.floor(rand() * (n + 2)),
          });
        }
      }
      const got = editPlan({ steps, edits });
      let expOk = true;
      let expReason = '';
      const list: Array<{ action: string; detail: string; id: string }> = [];
      if (steps.length === 0) {
        expOk = false;
        expReason = 'plan-steps-empty';
      } else if (steps.length > 20) {
        expOk = false;
        expReason = 'plan-steps-limit:' + steps.length;
      } else {
        const seen = new Set<string>();
        for (const s of steps) {
          const id = typeof s.id === 'string' ? s.id.trim() : '';
          if (id.length === 0) {
            expOk = false;
            expReason = 'plan-edit-step-id-missing';
            break;
          }
          if (seen.has(id)) {
            expOk = false;
            expReason = 'plan-edit-step-duplicate:' + id;
            break;
          }
          seen.add(id);
          const a = typeof s.action === 'string' ? s.action.trim().toLowerCase() : '';
          if (a.length === 0) {
            expOk = false;
            expReason = 'plan-step-action-missing';
            break;
          }
          if (!ORACLE_ACTIONS.includes(a)) {
            expOk = false;
            expReason = 'plan-step-action-unknown:' + a;
            break;
          }
          const d = typeof s.detail === 'string' && s.detail.trim().length > 0 ? s.detail.trim() : a;
          list.push({ action: a, detail: d, id });
        }
        if (expOk && edits.length === 0) {
          expOk = false;
          expReason = 'plan-edits-empty';
        }
        for (const e of edits) {
          if (!expOk) break;
          const op = typeof e.op === 'string' ? e.op.trim().toLowerCase() : '';
          if (op.length === 0) {
            expOk = false;
            expReason = 'plan-edit-op-missing';
            break;
          }
          if (op === 'insert') {
            const idx = typeof e.index === 'number' && Number.isInteger(e.index) ? e.index : -1;
            if (idx < 0 || idx > list.length) {
              expOk = false;
              expReason = 'plan-edit-index-invalid:' + String(e.index);
              break;
            }
            const st = e.step;
            if (!st || typeof st !== 'object') {
              expOk = false;
              expReason = 'plan-edit-step-missing';
              break;
            }
            const a =
              typeof (st as Record<string, unknown>).action === 'string'
                ? ((st as Record<string, unknown>).action as string).trim().toLowerCase()
                : '';
            if (a.length === 0) {
              expOk = false;
              expReason = 'plan-step-action-missing';
              break;
            }
            if (!ORACLE_ACTIONS.includes(a)) {
              expOk = false;
              expReason = 'plan-step-action-unknown:' + a;
              break;
            }
            const rawDetail = (st as Record<string, unknown>).detail;
            const d = typeof rawDetail === 'string' && rawDetail.trim().length > 0 ? rawDetail.trim() : a;
            list.splice(idx, 0, { action: a, detail: d, id: 'inserted' });
          } else if (op === 'remove') {
            const id = typeof e.id === 'string' ? e.id.trim() : '';
            const pos = list.findIndex((x) => x.id === id);
            if (pos < 0) {
              expOk = false;
              expReason = 'plan-edit-id-unknown:' + (id.length > 0 ? id : 'missing');
              break;
            }
            list.splice(pos, 1);
          } else if (op === 'move') {
            const id = typeof e.id === 'string' ? e.id.trim() : '';
            const pos = list.findIndex((x) => x.id === id);
            if (pos < 0) {
              expOk = false;
              expReason = 'plan-edit-id-unknown:' + (id.length > 0 ? id : 'missing');
              break;
            }
            const to = typeof e.toIndex === 'number' && Number.isInteger(e.toIndex) ? e.toIndex : -1;
            if (to < 0 || to >= list.length) {
              expOk = false;
              expReason = 'plan-edit-target-invalid:' + String(e.toIndex);
              break;
            }
            const arr = list.splice(pos, 1);
            list.splice(to, 0, ...arr);
          } else {
            expOk = false;
            expReason = 'plan-edit-op-unknown:' + op;
            break;
          }
        }
        if (expOk && list.length === 0) {
          expOk = false;
          expReason = 'plan-edit-result-empty';
        }
        if (expOk && list.length > 20) {
          expOk = false;
          expReason = 'plan-steps-limit:' + list.length;
        }
      }
      expect(got.ok).toBe(expOk);
      if (expOk) {
        const expSteps = list.map((s, i) => ({
          id: 's' + (i + 1),
          action: s.action,
          detail: s.detail,
          dependsOn: i === 0 ? [] : ['s' + i],
        }));
        expect(got.steps).toEqual(expSteps);
      } else {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });
});
