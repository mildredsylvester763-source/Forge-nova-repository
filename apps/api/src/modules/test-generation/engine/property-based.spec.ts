import {
  planPropertySuite,
  generateIntCases,
  generateStringCases,
  shrinkInt,
  PROPERTY_RUNS_DEFAULT,
} from './property-based';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property-based engine (FORGE TQ-034)', () => {
  it('plans reproducible property suites with defaults', () => {
    const out = planPropertySuite({ name: 'sorts idempotently' });
    expect(out).toEqual({
      ok: true,
      name: 'sorts idempotently',
      runs: PROPERTY_RUNS_DEFAULT,
      seed: 42,
      repro: 'property:sorts idempotently seed:42 runs:100',
    });
    const custom = planPropertySuite({ name: 'p', runs: 5, seed: 7 });
    expect(custom.repro).toBe('property:p seed:7 runs:5');
    expect(planPropertySuite({})).toMatchObject({ reason: 'property-name-missing' });
    expect(planPropertySuite({ name: 'x'.repeat(201) })).toMatchObject({ reason: 'property-name-too-long' });
    expect(planPropertySuite({ name: 'x', runs: 0 })).toMatchObject({ reason: 'property-runs-invalid:0' });
    expect(planPropertySuite({ name: 'x', runs: 1001 })).toMatchObject({ reason: 'property-runs-invalid:1001' });
    expect(planPropertySuite({ name: 'x', seed: -1 })).toMatchObject({ reason: 'property-seed-invalid:-1' });
  });

  it('generates deterministic inclusive int cases', () => {
    const out = generateIntCases({ seed: 42, runs: 5, min: 0, max: 9 });
    expect(out.cases).toEqual([6, 4, 8, 6, 1]);
    const again = generateIntCases({ seed: 42, runs: 5, min: 0, max: 9 });
    expect(again.cases).toEqual(out.cases);
    const offset = generateIntCases({ seed: 42, runs: 5, min: 10, max: 19 });
    expect(offset.cases).toEqual([16, 14, 18, 16, 11]);
    expect(generateIntCases({ seed: 1, runs: 3, min: 5, max: 4 })).toMatchObject({
      reason: 'property-range-invalid:5:4',
    });
  });

  it('generates deterministic string cases with custom alphabets', () => {
    const out = generateStringCases({ seed: 42, runs: 3, alphabet: 'ab', maxLen: 4 });
    expect(out.cases).toEqual(['abb', 'b', 'bb']);
    const def = generateStringCases({ seed: 42, runs: 2, maxLen: 3 });
    expect(def.cases?.every((s) => /^[a-z]+$/.test(s) && s.length <= 3)).toBe(true);
    expect(generateStringCases({ seed: 1, runs: 2, maxLen: 0 })).toMatchObject({
      reason: 'property-length-invalid:0',
    });
    expect(generateStringCases({ seed: 1, runs: 2, maxLen: 1001 })).toMatchObject({
      reason: 'property-length-invalid:1001',
    });
  });

  it('shrinks failures to the smallest failing input for upward-closed predicates', () => {
    expect(shrinkInt((v) => v >= 10, 100)).toBe(10);
    expect(shrinkInt((v) => v >= 0, 57)).toBe(0);
    expect(shrinkInt(() => false, 100)).toBe(100);
    expect(shrinkInt((v) => v >= 100, 100)).toBe(100);
  });

  it('matches an independent oracle on 500 mulberry32(42) case streams', () => {
    const rand = mulberry32(42);
    for (let c = 0; c < 500; c++) {
      const isInt = rand() < 0.5;
      const runs = 1 + Math.floor(rand() * 10);
      const seed = Math.floor(rand() * 1000);
      if (isInt) {
        const min = Math.floor(rand() * 6);
        const max = min + Math.floor(rand() * 10);
        const got = generateIntCases({ seed, runs, min, max });
        const o = mulberry32(seed);
        const oracle: number[] = [];
        for (let i = 0; i < runs; i++) oracle.push(min + Math.floor(o() * (max - min + 1)));
        expect(got.ok).toBe(true);
        expect(got.cases).toEqual(oracle);
        expect(got.cases?.every((v) => v >= min && v <= max)).toBe(true);
      } else {
        const maxLen = 1 + Math.floor(rand() * 10);
        const got = generateStringCases({ seed, runs, alphabet: 'abc', maxLen });
        const o = mulberry32(seed);
        const oracle: string[] = [];
        for (let i = 0; i < runs; i++) {
          const len = 1 + Math.floor(o() * maxLen);
          let s = '';
          for (let j = 0; j < len; j++) s += 'abc'[Math.floor(o() * 3)];
          oracle.push(s);
        }
        expect(got.ok).toBe(true);
        expect(got.cases).toEqual(oracle);
        expect(got.cases?.every((s) => /^[abc]+$/.test(s) && s.length <= maxLen)).toBe(true);
      }
    }
  });
});
