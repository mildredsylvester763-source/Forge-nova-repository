import { convertSession, ConversionStep } from './test-conversion';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('one-click test conversion engine', () => {
  it('pins the converted case: name from the goal, one line per step', () => {
    const v = convertSession({ title: 'Buy the mug', tasks: [{ id: 'task-1', text: 'purchase a red mug' }] }, [
      { seq: 1, action: 'navigate', target: 'shop page' },
      { seq: 2, action: 'click', target: 'red mug card' },
      { seq: 3, action: 'click', target: 'checkout button' },
    ]);
    expect(v.ok).toBe(true);
    expect(v.testCase.name).toBe('purchase a red mug');
    expect(v.testCase.caseSteps).toEqual([
      { id: 'case-1', line: 'navigate shop page' },
      { id: 'case-2', line: 'click red mug card' },
      { id: 'case-3', line: 'click checkout button' },
    ]);
    expect(v.testCase.expected).toBe('All 3 steps replay in the same order');
  });

  it('falls back to the session title, then to a fixed name', () => {
    let v = convertSession({ title: 'Buy the mug', tasks: null }, [{ seq: 1, action: 'navigate', target: null }]);
    expect(v.testCase.name).toBe('Buy the mug');
    v = convertSession({ title: null, tasks: null }, [{ seq: 1, action: 'navigate', target: null }]);
    expect(v.testCase.name).toBe('Converted session');
  });

  it('drops the target clause when a step has no target', () => {
    const v = convertSession({ title: 'X', tasks: [] }, [{ seq: 1, action: 'navigate', target: null }]);
    expect(v.testCase.caseSteps[0].line).toBe('navigate');
  });

  it('refuses empty sessions and broken step sequences with named reasons', () => {
    let v = convertSession({ title: 'X', tasks: [] }, []);
    expect(v.reason).toBe('conversion-empty');
    v = convertSession({ title: 'X', tasks: [] }, [{ seq: 3, action: 'click', target: 'a' }]);
    expect(v.reason).toBe('conversion-step-seq-broken:3');
    v = convertSession({ title: 'X', tasks: [] }, [{ seq: 1, action: '  ', target: 'a' }]);
    expect(v.reason).toBe('conversion-step-action-empty:1');
  });

  it('survives a 500-case sweep of step sets with injected faults', () => {
    const rnd = mulberry32(42);
    const actions = ['click', 'type', 'scroll', 'navigate', 'swipe', 'assert'];
    const targets = ['checkout page', 'cart icon', 'login form', 'menu bar', 'search field'];
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rnd() * 6);
      const roll = rnd();
      const steps: ConversionStep[] = [];
      for (let s = 0; s < n; s++) {
        steps.push({
          seq: s + 1,
          action: actions[Math.floor(rnd() * actions.length)],
          target: rnd() < 0.7 ? targets[Math.floor(rnd() * targets.length)] : null,
        });
      }
      if (roll < 0.1 && steps.length > 0) {
        steps[steps.length - 1].seq = 7;
      }
      if (roll > 0.93) {
        steps.push({ seq: n + 1, action: ' ', target: null });
      }
      const v = convertSession({ title: 'Goal ' + i, tasks: [] }, steps);
      if (steps.length === 0) {
        expect(v.reason).toBe('conversion-empty');
      } else {
        const last = steps[steps.length - 1];
        if (last.seq !== steps.length) {
          expect(v.reason).toBe('conversion-step-seq-broken:' + last.seq);
        } else if (last.action.trim().length === 0) {
          expect(v.reason).toBe('conversion-step-action-empty:' + last.seq);
        } else {
          expect(v.ok).toBe(true);
          expect(v.testCase.caseSteps).toHaveLength(steps.length);
          v.testCase.caseSteps.forEach((s, idx) => expect(s.id).toBe('case-' + (idx + 1)));
        }
      }
    }
  });
});
