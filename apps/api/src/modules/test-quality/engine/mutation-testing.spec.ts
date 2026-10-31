import { planMutants, scoreMutants, MUTATION_OPERATORS, Mutant } from './mutation-testing';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('mutation-testing engine (FORGE TQ-036)', () => {
  it('plans one mutant per line per operator with the pinned vector', () => {
    const plan = planMutants({ source: ['const a = 1 + 2;', 'if (a > 3) { return true; }'] });
    expect(plan.ok).toBe(true);
    expect(plan.count).toBe(5);
    expect(plan.mutants?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(plan.mutants?.map((m) => m.operator)).toEqual([
      'arith-swap',
      'number-zero',
      'flip-boolean',
      'comparison-shift',
      'number-zero',
    ]);
    expect(plan.mutants?.[0].mutated).toBe('const a = 1 - 2;');
    expect(plan.mutants?.[1].mutated).toBe('const a = 0 + 2;');
    expect(plan.mutants?.[2].mutated).toBe('if (a > 3) { return false; }');
    expect(plan.mutants?.[3].mutated).toBe('if (a >= 3) { return true; }');
    expect(plan.mutants?.[4].mutated).toBe('if (a > 0) { return true; }');
  });

  it('scores detected over total against the threshold', () => {
    const plan = planMutants({ source: ['const a = 1 + 2;', 'if (a > 3) { return true; }'] });
    const mutants = (plan.mutants ?? []) as Mutant[];
    const report = scoreMutants({
      mutants,
      results: { m1: 'killed', m2: 'survived', m3: 'timeout', m4: 'killed', m5: 'survived' },
    });
    expect(report.score).toBe(60);
    expect(report.detected).toBe(3);
    expect(report.passed).toBe(false);
    const tight = scoreMutants({
      mutants,
      results: { m1: 'killed', m2: 'killed', m3: 'killed', m4: 'killed', m5: 'survived' },
      threshold: 60,
    });
    expect(tight.score).toBe(80);
    expect(tight.passed).toBe(true);
  });

  it('refuses invalid inputs with named reasons', () => {
    expect(planMutants({ source: [] })).toMatchObject({ reason: 'mutation-source-empty' });
    expect(planMutants({ source: ['ok = 1;', 42] })).toMatchObject({
      reason: 'mutation-line-missing:2',
    });
    expect(planMutants({ source: ['ok = 1;'], operators: ['dance'] })).toMatchObject({
      reason: 'mutation-operator-unknown:dance',
    });
    expect(planMutants({ source: ['ok = 1;'], operators: 'flip-boolean' })).toMatchObject({
      reason: 'mutation-operators-invalid',
    });
    expect(scoreMutants({ mutants: [], results: {} })).toMatchObject({
      reason: 'mutation-mutants-empty',
    });
    expect(scoreMutants({ mutants: [{ id: 'm1' }], results: ['killed'] })).toMatchObject({
      reason: 'mutation-results-invalid',
    });
    expect(scoreMutants({ mutants: [{ id: 'm1' }], results: { m9: 'killed' } })).toMatchObject({
      reason: 'mutation-mutant-unknown:m9',
    });
    expect(scoreMutants({ mutants: [{ id: 'm1' }], results: {} })).toMatchObject({
      reason: 'mutation-result-missing:m1',
    });
    expect(scoreMutants({ mutants: [{ id: 'm1' }], results: { m1: 'zombie' } })).toMatchObject({
      reason: 'mutation-state-invalid:zombie:m1',
    });
    expect(
      scoreMutants({ mutants: [{ id: 'm1' }], results: { m1: 'killed' }, threshold: 101 }),
    ).toMatchObject({ reason: 'mutation-threshold-invalid:101' });
  });

  it('matches an independent split-based oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const vars = ['a', 'b', 'count', 'total', 'x'];
    const nums = ['0', '1', '2', '10', '42', '100'];
    const strs = ["'hello'", "'world'", '"done"', ''];
    const oracleGuardedIdx = (line: string, ch: string): number => {
      const parts = line.split(ch);
      for (let i = 0; i < parts.length - 1; i++) {
        const before = parts[i];
        const after = parts[i + 1];
        const prev = before.length > 0 ? before[before.length - 1] : '';
        const next = after.length > 0 ? after[0] : '';
        if (prev === ch || next === ch || next === '=') continue;
        return before.length;
      }
      return -1;
    };
    const oracleApply = (line: string, op: string): string | null => {
      if (op === 'flip-boolean') {
        if (line.includes('true')) {
          const i = line.indexOf('true');
          return line.slice(0, i) + 'false' + line.slice(i + 4);
        }
        if (line.includes('false')) {
          const i = line.indexOf('false');
          return line.slice(0, i) + 'true' + line.slice(i + 5);
        }
        return null;
      }
      if (op === 'arith-swap') {
        const swaps: Array<[string, string]> = [
          ['+', '-'],
          ['-', '+'],
          ['*', '/'],
          ['/', '*'],
        ];
        for (const [from, to] of swaps) {
          const idx = oracleGuardedIdx(line, from);
          if (idx >= 0) return line.slice(0, idx) + to + line.slice(idx + 1);
        }
        return null;
      }
      if (op === 'comparison-shift') {
        if (line.includes('<=')) {
          const i = line.indexOf('<=');
          return line.slice(0, i) + '<' + line.slice(i + 2);
        }
        if (line.includes('>=')) {
          const i = line.indexOf('>=');
          return line.slice(0, i) + '>' + line.slice(i + 2);
        }
        const lt = line.indexOf('<');
        if (lt >= 0 && line[lt + 1] !== '=') return line.slice(0, lt) + '<=' + line.slice(lt + 1);
        const gt = line.indexOf('>');
        if (gt >= 0 && line[gt + 1] !== '=') return line.slice(0, gt) + '>=' + line.slice(gt + 1);
        return null;
      }
      if (op === 'number-zero') {
        const re = /\d+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          if (/[1-9]/.test(m[0])) return line.slice(0, m.index) + '0' + line.slice(m.index + m[0].length);
        }
        return null;
      }
      if (op === 'string-empty') {
        if (/'[^']+'/.test(line)) return line.replace(/'[^']+'/, "''");
        if (/"[^"]+"/.test(line)) return line.replace(/"[^"]+"/, '""');
        return null;
      }
      if (op === 'logical-swap') {
        if (line.includes('&&')) {
          const i = line.indexOf('&&');
          return line.slice(0, i) + '||' + line.slice(i + 2);
        }
        if (line.includes('||')) {
          const i = line.indexOf('||');
          return line.slice(0, i) + '&&' + line.slice(i + 2);
        }
        return null;
      }
      return null;
    };
    for (let c = 0; c < 500; c++) {
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines: string[] = [];
      for (let l = 0; l < lineCount; l++) {
        let s = 'const ' + vars[Math.floor(rand() * vars.length)] + ' = ';
        const kind = Math.floor(rand() * 7);
        if (kind === 0) s += nums[Math.floor(rand() * nums.length)] + ' + ' + nums[Math.floor(rand() * nums.length)] + ';';
        else if (kind === 1) s += nums[Math.floor(rand() * nums.length)] + ' - ' + nums[Math.floor(rand() * nums.length)] + ';';
        else if (kind === 2) s += nums[Math.floor(rand() * nums.length)] + ' * ' + nums[Math.floor(rand() * nums.length)] + ';';
        else if (kind === 3) s += nums[Math.floor(rand() * nums.length)] + ' / ' + nums[Math.floor(rand() * nums.length)] + ';';
        else if (kind === 4) {
          const st = strs[Math.floor(rand() * strs.length)];
          s += st.length > 0 ? st + ';' : "'';";
        } else if (kind === 5) s += (rand() < 0.5 ? 'true' : 'false') + ';';
        else s += nums[Math.floor(rand() * nums.length)] + ';';
        if (rand() < 0.4) {
          s =
            'if (' +
            vars[Math.floor(rand() * vars.length)] +
            ' ' +
            ['<', '>', '<=', '>='][Math.floor(rand() * 4)] +
            ' ' +
            nums[Math.floor(rand() * nums.length)] +
            ') { ' +
            s +
            ' }';
        }
        if (rand() < 0.3) s = 'if (flag && ' + (rand() < 0.5 ? 'ready || done' : 'ok') + ') { ' + s + ' }';
        lines.push(s);
      }
      const verdict = planMutants({ source: lines });
      expect(verdict.ok).toBe(true);
      const expected: Mutant[] = [];
      for (let li = 0; li < lines.length; li++) {
        for (const op of MUTATION_OPERATORS) {
          const om = oracleApply(lines[li], op);
          if (om !== null && om !== lines[li]) {
            expected.push({
              id: 'm' + (expected.length + 1),
              line: li + 1,
              operator: op,
              original: lines[li],
              mutated: om,
            });
          }
        }
      }
      expect(verdict.mutants).toEqual(expected);
      if (expected.length === 0) {
        expect(scoreMutants({ mutants: verdict.mutants, results: {} })).toMatchObject({
          reason: 'mutation-mutants-empty',
        });
        continue;
      }
      const results: Record<string, string> = {};
      let ek = 0;
      let et = 0;
      for (const m of expected) {
        const r = rand();
        const state = r < 0.5 ? 'killed' : r < 0.8 ? 'survived' : 'timeout';
        results[m.id] = state;
        if (state === 'killed') ek++;
        else if (state === 'timeout') et++;
      }
      const threshold = Math.floor(rand() * 101);
      const report = scoreMutants({ mutants: expected, results, threshold });
      const expScore = Number((((ek + et) / expected.length) * 100).toFixed(2));
      expect(report.score).toBe(expScore);
      expect(report.passed).toBe(expScore >= threshold);
    }
  });
});
