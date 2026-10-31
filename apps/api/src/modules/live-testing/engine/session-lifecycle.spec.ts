import {
  SESSION_STATUSES,
  canHandBack,
  canTakeControl,
  isActing,
  isSessionStatus,
  isTerminal,
  transition,
} from './session-lifecycle';

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

// The transition table restated independently: the sweep recomputes every
// verdict against this copy, never against the engine itself.
const TABLE: Record<string, string[]> = {
  planned: ['running', 'cancelled'],
  running: ['paused', 'manual', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'manual', 'cancelled'],
  manual: ['running', 'paused', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

describe('session lifecycle engine (FORGE TQ-001/009/010)', () => {
  it('pins the legal transitions exactly', () => {
    expect(transition('planned', 'running')).toEqual({ ok: true });
    expect(transition('running', 'paused')).toEqual({ ok: true });
    expect(transition('paused', 'manual')).toEqual({ ok: true });
    expect(transition('manual', 'running')).toEqual({ ok: true });
    expect(transition('planned', 'cancelled')).toEqual({ ok: true });
    expect(transition('running', 'completed')).toEqual({ ok: true });
    expect(transition('running', 'failed')).toEqual({ ok: true });
  });

  it('refuses illegal and terminal moves with named reasons', () => {
    expect(transition('planned', 'completed')).toEqual({
      ok: false,
      reason: 'session-transition-illegal:planned:completed',
    });
    expect(transition('running', 'planned')).toEqual({
      ok: false,
      reason: 'session-transition-illegal:running:planned',
    });
    expect(transition('completed', 'running')).toEqual({
      ok: false,
      reason: 'session-terminal:completed',
    });
    expect(transition('failed', 'paused')).toEqual({
      ok: false,
      reason: 'session-terminal:failed',
    });
    expect(transition('bogus', 'running')).toEqual({
      ok: false,
      reason: 'session-unknown-status:bogus',
    });
    expect(transition('running', '')).toEqual({
      ok: false,
      reason: 'session-unknown-status:',
    });
  });

  it('gates manual control, hand back and acting precisely', () => {
    expect(canTakeControl('running')).toBe(true);
    expect(canTakeControl('paused')).toBe(true);
    expect(canTakeControl('planned')).toBe(false);
    expect(canTakeControl('manual')).toBe(false);
    expect(canTakeControl('completed')).toBe(false);
    expect(canHandBack('manual')).toBe(true);
    expect(canHandBack('running')).toBe(false);
    expect(isActing('running')).toBe(true);
    expect(isActing('manual')).toBe(true);
    expect(isActing('paused')).toBe(false);
    expect(isActing('planned')).toBe(false);
  });

  it('lists every status and flags exactly the terminal set', () => {
    expect(SESSION_STATUSES).toHaveLength(7);
    for (const s of SESSION_STATUSES) {
      expect(isSessionStatus(s)).toBe(true);
      expect(isTerminal(s)).toBe(
        s === 'completed' || s === 'failed' || s === 'cancelled',
      );
    }
    expect(isSessionStatus('RUNNING')).toBe(false);
    expect(isSessionStatus('paused ')).toBe(false);
  });

  it('500-case sweep: verdicts recompute exactly from the table', () => {
    const rand = mulberry32(42);
    const pool = SESSION_STATUSES.concat(['nonsense', '', 'RUNNING', 'paused ']);
    for (let i = 0; i < 500; i++) {
      const from = pool[Math.floor(rand() * pool.length)];
      const to = pool[Math.floor(rand() * pool.length)];
      const v = transition(from, to);
      const legal =
        isSessionStatus(from) &&
        isSessionStatus(to) &&
        !isTerminal(from) &&
        TABLE[from].includes(to);
      expect(v.ok).toBe(legal);
      if (!v.ok) {
        expect(typeof v.reason).toBe('string');
        expect(v.reason).toContain('session-');
        if (v.reason === 'session-terminal:' + from) {
          expect(isSessionStatus(from) && isTerminal(from)).toBe(true);
        }
      }
    }
  });
});
