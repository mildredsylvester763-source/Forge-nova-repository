// Engine spec for task control (FORGE AI-081). Pinned vectors first,
// then a 500-case mulberry32(42) sweep against an independent oracle.

describe('task control engine (FORGE AI-081)', () => {
  it('walks the legal pause, resume, cancel and takeover transitions', () => {
    const paused = applyTaskCommand({ state: 'running', command: 'pause' });
    expect(paused).toEqual({ ok: true, from: 'running', command: 'pause', to: 'paused', terminal: false });
    const resumed = applyTaskCommand({ state: 'paused', command: 'resume' });
    expect(resumed.to).toBe('running');
    expect(resumed.terminal).toBe(false);
    const cancelled = applyTaskCommand({ state: 'running', command: 'cancel' });
    expect(cancelled.to).toBe('cancelled');
    expect(cancelled.terminal).toBe(true);
    const taken = applyTaskCommand({ state: 'paused', command: 'takeover' });
    expect(taken.to).toBe('overtaken');
    expect(taken.terminal).toBe(true);
    const fromPaused = applyTaskCommand({ state: 'paused', command: 'cancel' });
    expect(fromPaused.to).toBe('cancelled');
  });

  it('normalizes case and trims whitespace before matching', () => {
    const verdict = applyTaskCommand({ state: 'PAUSED', command: ' RESUME ' });
    expect(verdict.ok).toBe(true);
    expect(verdict.to).toBe('running');
  });

  it('rejects illegal live-state transitions by name', () => {
    expect(applyTaskCommand({ state: 'running', command: 'resume' }).reason).toBe('task-invalid-transition:running:resume');
    expect(applyTaskCommand({ state: 'paused', command: 'pause' }).reason).toBe('task-invalid-transition:paused:pause');
  });

  it('accepts no commands from any terminal state', () => {
    for (const state of ['cancelled', 'completed', 'failed', 'overtaken']) {
      for (const command of ['pause', 'resume', 'cancel', 'takeover']) {
        const verdict = applyTaskCommand({ state, command });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('task-invalid-transition:' + state + ':' + command);
      }
    }
  });

  it('exposes terminality for downstream guards', () => {
    expect(isTaskTerminal('running')).toBe(false);
    expect(isTaskTerminal('paused')).toBe(false);
    expect(isTaskTerminal('overtaken')).toBe(true);
    expect(isTaskTerminal('Completed')).toBe(true);
  });

  it('refuses malformed inputs with named reasons', () => {
    expect(applyTaskCommand({ command: 'pause' }).reason).toBe('task-state-missing');
    expect(applyTaskCommand({ state: 'zombie', command: 'pause' }).reason).toBe('task-state-unknown:zombie');
    expect(applyTaskCommand({ state: 'running' }).reason).toBe('task-command-missing');
    expect(applyTaskCommand({ state: 'running', command: 'rewind' }).reason).toBe('task-command-unknown:rewind');
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
    function oracleApply(inp: TaskCommandInput): TaskCommandResult {
      const state = typeof inp?.state === 'string' ? (inp.state as string).trim().toLowerCase() : '';
      if (state === '') return { ok: false, reason: 'task-state-missing' };
      if (TASK_STATES.indexOf(state) === -1) return { ok: false, reason: 'task-state-unknown:' + state };
      const command = typeof inp?.command === 'string' ? (inp.command as string).trim().toLowerCase() : '';
      if (command === '') return { ok: false, reason: 'task-command-missing' };
      if (TASK_COMMANDS.indexOf(command) === -1) return { ok: false, reason: 'task-command-unknown:' + command };
      let next: string | undefined;
      if (state === 'running') {
        if (command === 'pause') next = 'paused';
        else if (command === 'cancel') next = 'cancelled';
        else if (command === 'takeover') next = 'overtaken';
      } else if (state === 'paused') {
        if (command === 'resume') next = 'running';
        else if (command === 'cancel') next = 'cancelled';
        else if (command === 'takeover') next = 'overtaken';
      }
      if (next === undefined) return { ok: false, reason: 'task-invalid-transition:' + state + ':' + command };
      return { ok: true, from: state, command, to: next, terminal: TASK_TERMINAL_STATES.indexOf(next) !== -1 };
    }
    const rand = mulberry32(42);
    let mismatches = 0;
    const reasonsSeen = new Set<string>();
    let okCount = 0;
    const targets = new Set<string>();
    for (let c = 0; c < 500; c++) {
      const state = rand() < 0.1 ? ['zombie', 'RUNNING', ''][Math.floor(rand() * 3)] : TASK_STATES[Math.floor(rand() * 6)];
      const command = rand() < 0.1 ? ['rewind', 'PAUSE', ''][Math.floor(rand() * 3)] : TASK_COMMANDS[Math.floor(rand() * 4)];
      const input = rand() < 0.05 ? { state } : { state, command };
      const mine = applyTaskCommand(input as TaskCommandInput);
      const oracle = oracleApply(input as TaskCommandInput);
      if (stable(mine) !== stable(oracle)) mismatches++;
      if (mine.reason) reasonsSeen.add(mine.reason);
      if (mine.ok) {
        okCount++;
        targets.add(mine.from + '>' + mine.to);
      }
    }
    expect(mismatches).toBe(0);
    expect(reasonsSeen.size).toBeGreaterThan(10);
    expect(okCount).toBeGreaterThan(50);
    expect(targets.size).toBe(6);
  });
});
