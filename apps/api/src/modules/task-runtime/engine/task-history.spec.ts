// Engine spec for task history (FORGE AI-082). Pinned vectors first,
// then a 500-case mulberry32(42) sweep against an independent oracle.

describe('task history engine (FORGE AI-082)', () => {
  const journal = [
    { seq: 1, type: 'task-created' },
    { seq: 2, type: 'step-started', stepId: 's1' },
    { seq: 3, type: 'step-validated', stepId: 's1' },
    { seq: 4, type: 'gate-requested', gateId: 'g1' },
    { seq: 5, type: 'gate-resolved', gateId: 'g1' },
    { seq: 6, type: 'task-paused' },
    { seq: 7, type: 'task-resumed' },
    { seq: 8, type: 'step-completed', stepId: 's1' },
    { seq: 9, type: 'task-completed' },
  ];

  it('appends events with contiguous sequence numbers', () => {
    const first = appendTaskEvent({ events: [], event: { type: 'task-created' } });
    expect(first.ok).toBe(true);
    expect(first.seq).toBe(1);
    expect(first.events).toEqual([{ type: 'task-created', seq: 1 }]);
    const second = appendTaskEvent({ events: first.events, event: { type: 'step-started', stepId: 's1' } });
    expect(second.ok).toBe(true);
    expect(second.seq).toBe(2);
    expect(second.events[1].stepId).toBe('s1');
  });

  it('replays a full journal to its final state', () => {
    const verdict = replayTask({ events: journal });
    expect(verdict.ok).toBe(true);
    expect(verdict.seq).toBe(9);
    expect(verdict.applied).toBe(9);
    expect(verdict.state).toBe('completed');
    expect(verdict.steps).toEqual([{ stepId: 's1', status: 'completed' }]);
    expect(verdict.gates).toEqual([{ gateId: 'g1', status: 'resolved' }]);
  });

  it('replays to any midpoint with partial ledgers', () => {
    const paused = replayTask({ events: journal, toSeq: 6 });
    expect(paused.state).toBe('paused');
    expect(paused.steps).toEqual([{ stepId: 's1', status: 'validated' }]);
    expect(paused.gates).toEqual([{ gateId: 'g1', status: 'resolved' }]);
    const gateOpen = replayTask({ events: journal, toSeq: 4 });
    expect(gateOpen.state).toBe('running');
    expect(gateOpen.gates).toEqual([{ gateId: 'g1', status: 'requested' }]);
    expect(gateOpen.steps).toEqual([{ stepId: 's1', status: 'validated' }]);
  });

  it('treats an empty journal as a created task that applied nothing', () => {
    const verdict = replayTask({ events: [] });
    expect(verdict.ok).toBe(true);
    expect(verdict.state).toBe('created');
    expect(verdict.applied).toBe(0);
    expect(verdict.steps).toEqual([]);
    expect(verdict.gates).toEqual([]);
  });

  it('tracks multiple steps and terminal failure or takeover', () => {
    const failed = replayTask({
      events: [
        { seq: 1, type: 'task-created' },
        { seq: 2, type: 'step-started', stepId: 's1' },
        { seq: 3, type: 'step-failed', stepId: 's1' },
        { seq: 4, type: 'task-failed' },
      ],
    });
    expect(failed.state).toBe('failed');
    expect(failed.steps).toEqual([{ stepId: 's1', status: 'failed' }]);
    const taken = replayTask({ events: [{ seq: 1, type: 'task-created' }, { seq: 2, type: 'takeover' }] });
    expect(taken.state).toBe('overtaken');
    const multi = replayTask({
      events: [
        { seq: 1, type: 'step-started', stepId: 's2' },
        { seq: 2, type: 'step-started', stepId: 's1' },
        { seq: 3, type: 'step-completed', stepId: 's2' },
      ],
    });
    expect(multi.steps).toEqual([
      { stepId: 's2', status: 'completed' },
      { stepId: 's1', status: 'started' },
    ]);
  });

  it('refuses broken journals and out-of-bounds replays with named reasons', () => {
    expect(appendTaskEvent({ events: 'x' } as { events: string }).reason).toBe('history-events-invalid');
    expect(appendTaskEvent({ events: [{ seq: 1, type: 'task-created' }], event: 'nope' }).reason).toBe('history-event-missing');
    expect(appendTaskEvent({ events: [], event: {} }).reason).toBe('history-type-missing:0');
    expect(appendTaskEvent({ events: [], event: { type: 'magic' } }).reason).toBe('history-type-unknown:magic');
    expect(replayTask({ events: [{ seq: 2, type: 'task-created' }] }).reason).toBe('history-seq-gap:1:2');
    expect(replayTask({ events: [{ seq: 1, type: 'task-created' }, null] }).reason).toBe('history-event-invalid:2');
    expect(replayTask({ events: [{ type: 'task-created' }] }).reason).toBe('history-seq-missing:1');
    expect(replayTask({ events: [{ seq: '1', type: 'task-created' }] }).reason).toBe('history-seq-invalid:1');
    expect(replayTask({ events: [{ seq: 1 }] }).reason).toBe('history-type-missing:1');
    expect(replayTask({ events: [{ seq: 1, type: 'teleported' }] }).reason).toBe('history-type-unknown:teleported');
    expect(replayTask({ events: journal, toSeq: 0 }).reason).toBe('history-to-seq-invalid:0');
    expect(replayTask({ events: journal, toSeq: 10 }).reason).toBe('history-to-seq-invalid:10');
    expect(replayTask({ events: journal, toSeq: 2.5 }).reason).toBe('history-to-seq-invalid:2.5');
  });

  it('matches an independent oracle across 500 random cases', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function stable(value: unknown): string {
      if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
      if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
      const keys = Object.keys(value as Record<string, unknown>).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k])).join(',') + '}';
    }
    function oracleReplay(inp: ReplayTaskInput): ReplayTaskResult {
      const evts = inp.events;
      if (!Array.isArray(evts)) return { ok: false, reason: 'history-events-invalid' };
      let idx = 0;
      while (idx < evts.length) {
        const e = evts[idx] as Record<string, unknown>;
        if (!(typeof e === 'object' && e !== null && !Array.isArray(e))) return { ok: false, reason: 'history-event-invalid:' + (idx + 1) };
        if (e.seq === undefined || e.seq === null) return { ok: false, reason: 'history-seq-missing:' + (idx + 1) };
        if (typeof e.seq !== 'number' || !Number.isInteger(e.seq)) return { ok: false, reason: 'history-seq-invalid:' + (idx + 1) };
        if (e.seq !== idx + 1) return { ok: false, reason: 'history-seq-gap:' + (idx + 1) + ':' + e.seq };
        const t = typeof e.type === 'string' ? (e.type as string).trim() : '';
        if (t === '') return { ok: false, reason: 'history-type-missing:' + (idx + 1) };
        if (TASK_EVENT_TYPES.indexOf(t) === -1) return { ok: false, reason: 'history-type-unknown:' + t };
        idx++;
      }
      const list = evts as Record<string, unknown>[];
      let target = list.length;
      const ts = inp.toSeq;
      if (ts !== undefined) {
        if (typeof ts !== 'number' || !Number.isInteger(ts) || ts < 1 || ts > list.length) {
          return { ok: false, reason: 'history-to-seq-invalid:' + (typeof ts === 'number' ? ts : 'missing') };
        }
        target = ts;
      }
      let state = 'created';
      const steps: { stepId: string; status: string }[] = [];
      const gates: { gateId: string; status: string }[] = [];
      let k = 0;
      while (k < target) {
        const e = list[k];
        const t = e.type as string;
        if (t === 'task-created') state = 'running';
        else if (t === 'task-paused') state = 'paused';
        else if (t === 'task-resumed') state = 'running';
        else if (t === 'task-cancelled') state = 'cancelled';
        else if (t === 'task-completed') state = 'completed';
        else if (t === 'task-failed') state = 'failed';
        else if (t === 'takeover') state = 'overtaken';
        else if (t === 'step-started' || t === 'step-validated' || t === 'step-completed' || t === 'step-failed') {
          const sid = typeof e.stepId === 'string' ? (e.stepId as string) : '?';
          const st = t === 'step-started' ? 'started' : t === 'step-validated' ? 'validated' : t === 'step-completed' ? 'completed' : 'failed';
          let f = -1;
          let q = 0;
          while (q < steps.length) {
            if (steps[q].stepId === sid) {
              f = q;
              break;
            }
            q++;
          }
          if (f === -1) steps.push({ stepId: sid, status: st });
          else steps[f] = { stepId: sid, status: st };
        } else {
          const gid = typeof e.gateId === 'string' ? (e.gateId as string) : '?';
          const st = t === 'gate-requested' ? 'requested' : 'resolved';
          let f = -1;
          let q = 0;
          while (q < gates.length) {
            if (gates[q].gateId === gid) {
              f = q;
              break;
            }
            q++;
          }
          if (f === -1) gates.push({ gateId: gid, status: st });
          else gates[f] = { gateId: gid, status: st };
        }
        k++;
      }
      return { ok: true, seq: target, applied: target, state, steps, gates };
    }
    const rand = mulberry32(42);
    let mismatches = 0;
    const reasonsSeen = new Set<string>();
    let replayOk = 0;
    for (let c = 0; c < 500; c++) {
      const len = Math.floor(rand() * 6);
      const events: unknown[] = [];
      for (let i = 0; i < len; i++) {
        const roll = rand();
        if (roll < 0.04) {
          events.push(null);
          break;
        }
        if (roll < 0.08) {
          events.push({ seq: i + 2, type: TASK_EVENT_TYPES[Math.floor(rand() * 13)] });
          break;
        }
        if (roll < 0.11) {
          events.push({ type: TASK_EVENT_TYPES[Math.floor(rand() * 13)] });
          break;
        }
        if (roll < 0.13) {
          events.push({ seq: i + 1, type: 'teleported' });
          break;
        }
        const type = TASK_EVENT_TYPES[Math.floor(rand() * 13)];
        const event: Record<string, unknown> = { seq: i + 1, type };
        if (type.startsWith('step-')) event.stepId = 's' + Math.floor(rand() * 3);
        if (type.startsWith('gate-')) event.gateId = 'g' + Math.floor(rand() * 2);
        events.push(event);
      }
      let toSeq: unknown;
      const toRoll = rand();
      if (toRoll < 0.3) toSeq = undefined;
      else if (toRoll < 0.5) toSeq = 1 + Math.floor(rand() * Math.max(1, len));
      else if (toRoll < 0.6) toSeq = len + 1;
      else toSeq = Math.floor(rand() * 2);
      const input = { events, toSeq } as ReplayTaskInput;
      const mine = replayTask(input);
      const oracle = oracleReplay(input);
      if (stable(mine) !== stable(oracle)) mismatches++;
      if (mine.reason) reasonsSeen.add(mine.reason);
      if (mine.ok) replayOk++;
      if (rand() < 0.3 && events.length < 6) {
        const evType = TASK_EVENT_TYPES[Math.floor(rand() * 13)];
        const appendInput = { events, event: { type: evType, stepId: 's9' } } as AppendTaskEventInput;
        const mineAppend = appendTaskEvent(appendInput);
        const journalValid = events.length === 0 ? true : oracleReplay({ events, toSeq: events.length } as ReplayTaskInput).ok;
        if (mineAppend.ok !== journalValid) mismatches++;
        if (mineAppend.ok && (mineAppend.seq !== events.length + 1 || mineAppend.events!.length !== events.length + 1)) mismatches++;
        if (mineAppend.reason) reasonsSeen.add(mineAppend.reason);
      }
    }
    expect(mismatches).toBe(0);
    expect(reasonsSeen.size).toBeGreaterThan(15);
    expect(replayOk).toBeGreaterThan(150);
  });
});
