import { planE2eSuite, E2E_ACTIONS } from './e2e-session-replay';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('e2e-session-replay engine (FORGE TQ-033)', () => {
  it('replays a recorded checkout session with dedupe and assertions', () => {
    const out = planE2eSuite({
      session: { name: 'checkout' },
      steps: [
        { action: 'navigate', target: '/', value: '' },
        { action: 'click', target: 'add-to-cart', value: '' },
        { action: 'click', target: 'add-to-cart', value: '' },
        { action: 'type', target: '#email', value: 'a@b.c' },
        { action: 'assert', target: 'cart badge 1', value: '' },
        { action: 'click', target: 'buy', value: '', checkpoint: true },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.session).toBe('checkout');
    expect(out.steps?.length).toBe(5);
    expect(out.deduped).toBe(1);
    expect(out.assertions?.map((a) => a.name)).toEqual([
      'assert:cart badge 1',
      'checkpoint:after:click:5',
    ]);
    expect(out.assertions?.map((a) => a.kind)).toEqual(['explicit', 'checkpoint']);
    expect(out.steps?.[3]).toEqual({ action: 'type', target: '#email', value: 'a@b.c' });
  });

  it('exposes the action catalog and refuses invalid sessions by name', () => {
    expect(E2E_ACTIONS).toEqual(['navigate', 'click', 'type', 'wait', 'assert']);
    expect(planE2eSuite({ session: { name: ' ' }, steps: [{ action: 'click', target: 'x' }] })).toMatchObject(
      { reason: 'e2e-session-name-missing' },
    );
    expect(
      planE2eSuite({ session: { name: 's' }, steps: [{ action: 'scroll', target: 'x' }] }),
    ).toMatchObject({ reason: 'e2e-action-unknown:scroll' });
    expect(planE2eSuite({ session: { name: 's' }, steps: [] })).toMatchObject({
      reason: 'e2e-steps-empty',
    });
    expect(
      planE2eSuite({
        session: { name: 's' },
        steps: Array.from({ length: 201 }, () => ({ action: 'wait', target: 'x' })),
      }),
    ).toMatchObject({ reason: 'e2e-steps-limit:201' });
  });

  it('matches an independent oracle on 500 mulberry32(42) random sessions', () => {
    const rand = mulberry32(42);
    const actions = ['navigate', 'click', 'type', 'wait', 'assert'];
    for (let c = 0; c < 500; c++) {
      const n = 1 + Math.floor(rand() * 12);
      const steps: Array<{ action: string; target: string; checkpoint?: boolean }> = [];
      for (let i = 0; i < n; i++) {
        const a = actions[Math.floor(rand() * actions.length)];
        steps.push({ action: a, target: 't' + Math.floor(rand() * 3), checkpoint: rand() < 0.2 && a !== 'assert' });
      }
      const got = planE2eSuite({ session: { name: 's' + c }, steps });
      const oracleSteps: Array<{ action: string; target: string; value: string }> = [];
      let dedupe = 0;
      for (const s of steps) {
        const norm = { action: s.action, target: s.target, value: '' };
        const prev = oracleSteps[oracleSteps.length - 1];
        if (prev && prev.action === norm.action && prev.target === norm.target && prev.value === norm.value) {
          dedupe++;
        } else {
          oracleSteps.push(norm);
        }
      }
      expect(got.ok).toBe(true);
      expect(got.steps?.length).toBe(oracleSteps.length);
      expect(got.deduped).toBe(dedupe);
      let explicit = 0;
      let checkpoint = 0;
      for (let i = 0; i < oracleSteps.length; i++) {
        if (oracleSteps[i].action === 'assert') explicit++;
      }
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].checkpoint && steps[i].action !== 'assert') {
          const wasDeduped = steps[i - 1] !== undefined &&
            steps[i - 1].action === steps[i].action && steps[i - 1].target === steps[i].target;
          if (!wasDeduped) checkpoint++;
        }
      }
      expect(got.assertions?.filter((a) => a.kind === 'explicit').length).toBe(explicit);
      expect(got.assertions?.filter((a) => a.kind === 'checkpoint').length).toBe(checkpoint);
    }
  });
});
