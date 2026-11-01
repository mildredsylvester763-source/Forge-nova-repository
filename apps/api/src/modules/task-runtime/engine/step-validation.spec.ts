// Engine spec for step validation (FORGE AI-079). Pinned vectors first,
// then a 500-case mulberry32(42) sweep against an independent oracle.

describe('step validation engine (FORGE AI-079)', () => {
  it('passes a step whose every check succeeds', () => {
    const verdict = validateStep({
      stepId: 's1',
      output: { exitCode: 0, title: 'Report', body: 'final text' },
      checks: [
        { type: 'exit-code' },
        { type: 'field', path: 'title' },
        { type: 'contains', text: 'final' },
        { type: 'equals', value: { body: 'final text', title: 'Report', exitCode: 0 } },
      ],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.stepId).toBe('s1');
    expect(verdict.passed).toBe(4);
    expect(verdict.failed).toBe(0);
    expect(verdict.failures).toEqual([]);
  });

  it('collects named failure details in check order', () => {
    const verdict = validateStep({
      stepId: 's2',
      output: { exitCode: 1, title: '' },
      checks: [{ type: 'exit-code' }, { type: 'field', path: 'title' }, { type: 'field', path: 'body' }],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.failed).toBe(3);
    expect(verdict.passed).toBe(0);
    expect(verdict.failures).toEqual([
      { index: 1, check: 'exit-code', detail: 'exit:1' },
      { index: 2, check: 'field', detail: 'field-empty:title' },
      { index: 3, check: 'field', detail: 'field-missing:body' },
    ]);
  });

  it('enforces max-length with missing, type and bound laws', () => {
    const over = validateStep({ stepId: 's3', output: { notes: 'abcde' }, checks: [{ type: 'max-length', path: 'notes', limit: 4 }] });
    expect(over.failures[0].detail).toBe('max-length:notes:5>4');
    const within = validateStep({ stepId: 's3', output: { notes: 'abcde' }, checks: [{ type: 'max-length', path: 'notes', limit: 5 }] });
    expect(within.ok).toBe(true);
    const missing = validateStep({ stepId: 's3', output: {}, checks: [{ type: 'max-length', path: 'notes', limit: 4 }] });
    expect(missing.failures[0].detail).toBe('max-length-missing:notes');
    const wrongType = validateStep({ stepId: 's3', output: { notes: 42 }, checks: [{ type: 'max-length', path: 'notes', limit: 4 }] });
    expect(wrongType.failures[0].detail).toBe('max-length-type:notes');
  });

  it('contains and equals evaluate against stable serialization', () => {
    const hit = validateStep({ stepId: 's4', output: { body: 'the final answer' }, checks: [{ type: 'contains', text: 'final' }] });
    expect(hit.ok).toBe(true);
    const miss = validateStep({ stepId: 's4', output: { body: 'draft only' }, checks: [{ type: 'contains', text: 'final' }] });
    expect(miss.failures[0]).toEqual({ index: 1, check: 'contains', detail: 'contains:final' });
    const same = validateStep({ stepId: 's4', output: { b: 2, a: [1, 2] }, checks: [{ type: 'equals', value: { a: [1, 2], b: 2 } }] });
    expect(same.ok).toBe(true);
    const differ = validateStep({ stepId: 's4', output: { b: 3 }, checks: [{ type: 'equals', value: { b: 2 } }] });
    expect(differ.failures[0].detail).toBe('equals-mismatch');
  });

  it('refuses malformed inputs with named reasons', () => {
    expect(validateStep({ checks: [{ type: 'exit-code' }] } as { checks: unknown }).reason).toBe('stepv-step-id-missing');
    expect(validateStep({ stepId: 's', checks: [] }).reason).toBe('stepv-checks-empty');
    expect(validateStep({ stepId: 's' } as { stepId: string }).reason).toBe('stepv-checks-missing');
    expect(validateStep({ stepId: 's', checks: [{ type: 'exit-code' }, null] }).reason).toBe('stepv-check-missing:2');
    expect(validateStep({ stepId: 's', checks: [{}] }).reason).toBe('stepv-check-type-missing:1');
    expect(validateStep({ stepId: 's', checks: [{ type: 'digest' }] }).reason).toBe('stepv-check-type-unknown:digest');
    expect(validateStep({ stepId: 's', checks: [{ type: 'field' }] }).reason).toBe('stepv-path-missing:1');
    expect(validateStep({ stepId: 's', checks: [{ type: 'max-length', path: 'n' }] }).reason).toBe('stepv-limit-missing:1');
    expect(validateStep({ stepId: 's', checks: [{ type: 'max-length', path: 'n', limit: -1 }] }).reason).toBe('stepv-limit-invalid:1');
    expect(validateStep({ stepId: 's', checks: [{ type: 'contains' }] }).reason).toBe('stepv-text-missing:1');
    expect(validateStep({ stepId: 's', checks: [{ type: 'equals' }] }).reason).toBe('stepv-value-missing:1');
    const tooMany: unknown[] = [];
    for (let i = 0; i < 51; i++) tooMany.push({ type: 'exit-code' });
    expect(validateStep({ stepId: 's', checks: tooMany }).reason).toBe('stepv-checks-limit:51');
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
    function oracleValidateStep(input: { stepId?: unknown; checks?: unknown; output?: unknown }): StepValidationResult {
      const sid = typeof input.stepId === 'string' ? input.stepId.trim() : '';
      const bad = (reason: string): StepValidationResult => ({ ok: false, reason, stepId: sid, passed: 0, failed: 0, failures: [] });
      if (sid === '') return bad('stepv-step-id-missing');
      if (sid.length > 100) return bad('stepv-step-id-too-long');
      const checks = input.checks;
      if (!Array.isArray(checks)) return bad('stepv-checks-missing');
      if (checks.length === 0) return bad('stepv-checks-empty');
      if (checks.length > 50) return bad('stepv-checks-limit:' + checks.length);
      const out = input.output;
      const fails: StepFailure[] = [];
      let idx = 0;
      while (idx < checks.length) {
        const c = checks[idx] as Record<string, unknown>;
        const n = idx + 1;
        const isObj = c !== null && typeof c === 'object' && !Array.isArray(c);
        if (!isObj) return bad('stepv-check-missing:' + n);
        const ctype = c.type;
        const type = typeof ctype === 'string' ? ctype.trim().toLowerCase() : '';
        const known = ['exit-code', 'field', 'max-length', 'contains', 'equals'];
        if (type === '') return bad('stepv-check-type-missing:' + n);
        if (known.indexOf(type) === -1) return bad('stepv-check-type-unknown:' + type);
        const objOut = out !== null && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : null;
        if (type === 'exit-code') {
          const ec = objOut ? objOut['exitCode'] : undefined;
          if (ec === undefined) fails.push({ index: n, check: type, detail: 'exit-missing' });
          else if (ec !== 0) fails.push({ index: n, check: type, detail: 'exit:' + String(ec) });
        } else if (type === 'field') {
          const p = typeof c.path === 'string' ? (c.path as string).trim() : '';
          if (p === '') return bad('stepv-path-missing:' + n);
          const v = objOut ? objOut[p] : undefined;
          if (v === undefined) fails.push({ index: n, check: type, detail: 'field-missing:' + p });
          else if (v === null || v === '') fails.push({ index: n, check: type, detail: 'field-empty:' + p });
        } else if (type === 'max-length') {
          const p = typeof c.path === 'string' ? (c.path as string).trim() : '';
          if (p === '') return bad('stepv-path-missing:' + n);
          const lim = c.limit;
          if (lim === undefined) return bad('stepv-limit-missing:' + n);
          if (typeof lim !== 'number' || !Number.isInteger(lim) || lim < 0) return bad('stepv-limit-invalid:' + n);
          const v = objOut ? objOut[p] : undefined;
          if (v === undefined) fails.push({ index: n, check: type, detail: 'max-length-missing:' + p });
          else if (typeof v !== 'string') fails.push({ index: n, check: type, detail: 'max-length-type:' + p });
          else if (v.length > lim) fails.push({ index: n, check: type, detail: 'max-length:' + p + ':' + v.length + '>' + lim });
        } else if (type === 'contains') {
          const t = typeof c.text === 'string' ? (c.text as string).trim() : '';
          if (t === '') return bad('stepv-text-missing:' + n);
          if (out === undefined) fails.push({ index: n, check: type, detail: 'contains-missing' });
          else {
            const subj = typeof out === 'string' ? out : stable(out);
            if (subj.indexOf(t) === -1) fails.push({ index: n, check: type, detail: 'contains:' + t });
          }
        } else {
          if (c.value === undefined) return bad('stepv-value-missing:' + n);
          if (out === undefined) fails.push({ index: n, check: type, detail: 'equals-missing' });
          else if (stable(out) !== stable(c.value)) fails.push({ index: n, check: type, detail: 'equals-mismatch' });
        }
        idx++;
      }
      const failed = fails.length;
      return { ok: failed === 0, stepId: sid, passed: checks.length - failed, failed, failures: fails };
    }
    const rand = mulberry32(42);
    const paths = ['title', 'body', 'notes', ''];
    const texts = ['final', 'missing', ''];
    const outputs: unknown[] = [
      undefined,
      'the final text',
      { exitCode: 0, title: 'Report', body: 'final text' },
      { exitCode: 1, title: '', notes: 'abcdef' },
      { title: 'Report', notes: 42 },
      {},
      'plain draft string',
      { exitCode: 2, body: null },
    ];
    let mismatches = 0;
    const reasonsSeen = new Set<string>();
    let okCount = 0;
    for (let c = 0; c < 500; c++) {
      const stepIdRoll = rand();
      const stepId = stepIdRoll < 0.08 ? '' : stepIdRoll < 0.12 ? (undefined as unknown) : 'step-' + Math.floor(rand() * 5);
      const checkCount = Math.floor(rand() * 7);
      const checks: unknown[] = [];
      for (let k = 0; k < checkCount; k++) {
        const roll = Math.floor(rand() * 6);
        const type = roll === 5 ? 'digest' : STEP_CHECK_TYPES[roll];
        const check: Record<string, unknown> = { type };
        if (type === 'field' || type === 'max-length') check.path = paths[Math.floor(rand() * paths.length)];
        if (type === 'max-length') check.limit = Math.floor(rand() * 12) - 1;
        if (type === 'contains') check.text = texts[Math.floor(rand() * texts.length)];
        if (type === 'equals' && rand() < 0.5) check.value = outputs[Math.floor(rand() * outputs.length)];
        if (rand() < 0.05) delete check.type;
        checks.push(check);
      }
      const output = outputs[Math.floor(rand() * outputs.length)];
      const input: Record<string, unknown> =
        checkCount === 0 && rand() < 0.5 ? { stepId } : { stepId, checks, output };
      if (rand() < 0.03) delete input.checks;
      const mine = validateStep(input as StepValidationInput);
      const oracle = oracleValidateStep(input as StepValidationInput);
      if (stable(mine) !== stable(oracle)) mismatches++;
      if (mine.reason) reasonsSeen.add(mine.reason);
      if (mine.ok) okCount++;
    }
    expect(mismatches).toBe(0);
    expect(reasonsSeen.size).toBeGreaterThan(8);
    expect(okCount).toBeGreaterThan(5);
  });
});
