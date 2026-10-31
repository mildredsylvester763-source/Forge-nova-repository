import { selectAgent, planHandoffs, AGENTS, CAPABILITIES } from './agent-selection';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('agent-selection engine (FORGE AI-076)', () => {
  it('selects the first capable agent for an action', () => {
    expect(selectAgent({ action: 'search' })).toEqual({ ok: true, agent: 'researcher' });
    expect(selectAgent({ action: 'dance' })).toMatchObject({
      reason: 'handoff-no-capable-agent:dance',
    });
    expect(selectAgent({ action: 'search', roster: ['writer', 'reviewer'] })).toMatchObject({
      reason: 'handoff-no-capable-agent:search',
    });
    expect(selectAgent({ action: 'search', roster: ['bot'] })).toMatchObject({
      reason: 'handoff-agent-unknown:bot',
    });
    expect(selectAgent({ action: '' })).toMatchObject({ reason: 'handoff-action-missing' });
    expect(selectAgent({})).toMatchObject({ reason: 'handoff-action-missing' });
    expect(
      selectAgent({ action: 'present', roster: ['coordinator', 'coordinator'] }),
    ).toMatchObject({ reason: 'handoff-agent-duplicate:coordinator' });
    expect(selectAgent({ action: 'search', roster: [] })).toMatchObject({
      reason: 'handoff-roster-empty',
    });
  });

  it('plans handoffs across a four-action plan', () => {
    const out = planHandoffs({
      steps: [{ action: 'search' }, { action: 'write' }, { action: 'run' }, { action: 'verify' }],
    });
    expect(out.ok).toBe(true);
    expect(out.assignments?.map((a) => a.agent)).toEqual([
      'researcher',
      'writer',
      'executor',
      'reviewer',
    ]);
    expect(out.handoffs).toEqual([
      { from: 'researcher', to: 'writer', atStep: 2 },
      { from: 'writer', to: 'executor', atStep: 3 },
      { from: 'executor', to: 'reviewer', atStep: 4 },
    ]);
  });

  it('detects ping-pong handoff bounces and keeps stable runs clean', () => {
    expect(
      planHandoffs({ steps: [{ action: 'search' }, { action: 'write' }, { action: 'search' }] }),
    ).toMatchObject({ reason: 'handoff-bounce-detected:researcher->writer->researcher' });
    const same = planHandoffs({ steps: [{ action: 'search' }, { action: 'search' }] });
    expect(same.assignments?.length).toBe(2);
    expect(same.handoffs).toEqual([]);
    const ring = planHandoffs({
      steps: [
        { action: 'run' },
        { action: 'verify' },
        { action: 'present' },
        { action: 'write' },
        { action: 'run' },
      ],
    });
    expect(ring.ok).toBe(true);
    expect(ring.handoffs?.length).toBe(4);
    expect(planHandoffs({ steps: [] })).toMatchObject({ reason: 'handoff-steps-empty' });
    expect(planHandoffs({ steps: [{ action: 'search' }, { action: 'dance' }] })).toMatchObject({
      reason: 'handoff-no-capable-agent:dance',
    });
    expect(planHandoffs({ steps: [{ action: 'search' }, { detail: 'x' }] })).toMatchObject({
      reason: 'handoff-action-missing',
    });
    expect(
      planHandoffs({ steps: [{ action: 'search' }], roster: ['reviewer', 'reviewer'] }),
    ).toMatchObject({ reason: 'handoff-agent-duplicate:reviewer' });
  });

  it('exposes the agent roster and capability map', () => {
    expect(AGENTS).toEqual(['coordinator', 'researcher', 'writer', 'executor', 'reviewer']);
    expect(CAPABILITIES.coordinator).toEqual(['present']);
    expect(CAPABILITIES.reviewer).toEqual(['verify']);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const ACTIONS = ['search', 'write', 'run', 'verify', 'present', 'dance'];
    const OWNER: Record<string, string> = {
      search: 'researcher',
      write: 'writer',
      run: 'executor',
      verify: 'reviewer',
      present: 'coordinator',
    };
    const ROSTER_POOL = ['coordinator', 'researcher', 'writer', 'executor', 'reviewer'];
    for (let c = 0; c < 500; c++) {
      const n = Math.floor(rand() * 9);
      const steps: Array<Record<string, unknown>> = [];
      for (let i = 0; i < n; i++) {
        const action = ACTIONS[Math.floor(rand() * ACTIONS.length)];
        if (rand() < 0.92) steps.push({ action });
        else steps.push({ detail: 'skip action' });
      }
      let roster: string[] | undefined;
      const rk = rand();
      if (rk < 0.2) {
        const picked: string[] = [];
        const rn = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < rn; i++) {
          picked.push(ROSTER_POOL[Math.floor(rand() * ROSTER_POOL.length)]);
        }
        roster = picked;
      } else if (rk < 0.27) {
        roster = ['bot'];
      }
      const got = planHandoffs({ steps, roster });
      const rosterList = Array.isArray(roster) ? roster : ROSTER_POOL;
      let expOk = true;
      let expReason = '';
      if (steps.length === 0) {
        expOk = false;
        expReason = 'handoff-steps-empty';
      } else if (rosterList.length === 0) {
        expOk = false;
        expReason = 'handoff-roster-empty';
      } else {
        const seen: string[] = [];
        for (const a of rosterList) {
          if (!ROSTER_POOL.includes(a)) {
            expOk = false;
            expReason = 'handoff-agent-unknown:' + String(a);
            break;
          }
          if (seen.includes(a)) {
            expOk = false;
            expReason = 'handoff-agent-duplicate:' + a;
            break;
          }
          seen.push(a);
        }
        if (expOk) {
          const assign: string[] = [];
          for (const s of steps) {
            const action = typeof s.action === 'string' ? s.action.trim().toLowerCase() : '';
            if (action.length === 0) {
              expOk = false;
              expReason = 'handoff-action-missing';
              break;
            }
            const ownerAgent = OWNER[action];
            if (!ownerAgent || !rosterList.includes(ownerAgent)) {
              expOk = false;
              expReason = 'handoff-no-capable-agent:' + action;
              break;
            }
            assign.push(ownerAgent);
          }
          if (expOk) {
            const expHandoffs: Array<{ from: string; to: string; atStep: number }> = [];
            let lastFrom = '';
            let bounced = false;
            for (let i = 1; i < assign.length; i++) {
              if (assign[i] !== assign[i - 1]) {
                if (lastFrom === assign[i]) {
                  expOk = false;
                  expReason =
                    'handoff-bounce-detected:' + assign[i] + '->' + assign[i - 1] + '->' + assign[i];
                  bounced = true;
                  break;
                }
                lastFrom = assign[i - 1];
                expHandoffs.push({ from: assign[i - 1], to: assign[i], atStep: i + 1 });
              }
            }
            if (expOk && !bounced) {
              expect(got.assignments?.map((a) => a.agent)).toEqual(assign);
              expect(got.handoffs).toEqual(expHandoffs);
            }
          }
        }
      }
      expect(got.ok).toBe(expOk);
      if (!expOk) {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });
});
