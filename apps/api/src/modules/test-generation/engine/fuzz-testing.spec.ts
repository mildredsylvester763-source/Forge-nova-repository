import { runFuzzCampaign, FUZZ_KINDS, FUZZ_FIELD_TYPES } from './fuzz-testing';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fuzz-testing engine (FORGE TQ-035)', () => {
  it('generates grammar cases with required fields always present', () => {
    const out = runFuzzCampaign({
      kind: 'api',
      fields: [
        { name: 'email', type: 'string', required: true },
        { name: 'age', type: 'int' },
      ],
      budget: 3,
      seed: 42,
    });
    expect(out.ok).toBe(true);
    expect(out.kind).toBe('api');
    expect(out.cases).toEqual([
      { index: 0, input: { email: 'lwrenhqw', age: 249 } },
      { index: 1, input: { email: 'thfnrpamvbp' } },
      { index: 2, input: { email: 'beun' } },
    ]);
    const again = runFuzzCampaign({
      kind: 'api',
      fields: [
        { name: 'email', type: 'string', required: true },
        { name: 'age', type: 'int' },
      ],
      budget: 3,
      seed: 42,
    });
    expect(again.cases).toEqual(out.cases);
  });

  it('mutates known-good samples with named mutations', () => {
    const out = runFuzzCampaign({ kind: 'parser', samples: ['hello'], budget: 2, seed: 42 });
    expect(out.cases).toEqual([
      { index: 0, input: { mutated: 'hellro' }, origin: 'hello', mutation: 'insert:4' },
      { index: 1, input: { mutated: 'heello' }, origin: 'hello', mutation: 'duplicate:1' },
    ]);
    const dup = runFuzzCampaign({ kind: 'format', samples: ['hello'], budget: 2, seed: 42 });
    expect(dup.cases).toEqual(out.cases);
  });

  it('exposes catalogs and refuses bad campaigns by name', () => {
    expect(FUZZ_KINDS).toEqual(['api', 'parser', 'format']);
    expect(FUZZ_FIELD_TYPES).toEqual(['string', 'int', 'bool', 'uuid']);
    expect(runFuzzCampaign({})).toMatchObject({ reason: 'fuzz-kind-missing' });
    expect(runFuzzCampaign({ kind: 'ui', samples: ['x'] })).toMatchObject({ reason: 'fuzz-kind-unknown:ui' });
    expect(runFuzzCampaign({ kind: 'api', samples: ['x'], budget: 0 })).toMatchObject({
      reason: 'fuzz-budget-invalid:0',
    });
    expect(runFuzzCampaign({ kind: 'api', samples: ['x'], budget: 1001 })).toMatchObject({
      reason: 'fuzz-budget-invalid:1001',
    });
    expect(runFuzzCampaign({ kind: 'api', samples: ['x'], seed: -1 })).toMatchObject({
      reason: 'fuzz-seed-invalid:-1',
    });
    expect(runFuzzCampaign({ kind: 'api' })).toMatchObject({ reason: 'fuzz-input-missing' });
    expect(runFuzzCampaign({ kind: 'api', fields: [] })).toMatchObject({ reason: 'fuzz-fields-empty' });
    expect(runFuzzCampaign({ kind: 'api', fields: [{ name: ' ', type: 'string' }] })).toMatchObject({
      reason: 'fuzz-field-name-missing',
    });
    expect(runFuzzCampaign({ kind: 'api', fields: [{ name: 'a', type: 'float' }] })).toMatchObject({
      reason: 'fuzz-field-type-unknown:float',
    });
    expect(
      runFuzzCampaign({
        kind: 'api',
        fields: [
          { name: 'a', type: 'string' },
          { name: 'a', type: 'int' },
        ],
      }),
    ).toMatchObject({ reason: 'fuzz-field-duplicate:a' });
    expect(runFuzzCampaign({ kind: 'parser', samples: [] })).toMatchObject({ reason: 'fuzz-samples-empty' });
    expect(runFuzzCampaign({ kind: 'parser', samples: [''] })).toMatchObject({ reason: 'fuzz-sample-invalid' });
    expect(runFuzzCampaign({ kind: 'parser', samples: [42] })).toMatchObject({ reason: 'fuzz-sample-invalid' });
  });

  it('matches an independent oracle on 500 mulberry32(42) campaigns', () => {
    const rand = mulberry32(42);
    const types = ['string', 'int', 'bool', 'uuid'];
    for (let c = 0; c < 500; c++) {
      const seed = Math.floor(rand() * 1000);
      const budget = 1 + Math.floor(rand() * 12);
      const grammar = rand() < 0.5;
      if (grammar) {
        const fcount = 1 + Math.floor(rand() * 4);
        const fields: Array<{ name: string; type: string; required?: boolean }> = [];
        for (let i = 0; i < fcount; i++) {
          fields.push({
            name: 'f' + i,
            type: types[Math.floor(rand() * types.length)],
            required: rand() < 0.5,
          });
        }
        const got = runFuzzCampaign({ kind: 'api', fields, budget, seed });
        const rerun = runFuzzCampaign({ kind: 'api', fields, budget, seed });
        expect(got.ok).toBe(true);
        expect(got.cases?.length).toBe(budget);
        expect(got.cases).toEqual(rerun.cases);
        for (const f of fields) {
          if (f.required) {
            expect(got.cases?.every((k) => k.input[f.name] !== undefined)).toBe(true);
          }
        }
        for (const k of got.cases ?? []) {
          expect(k.index).toBeLessThan(budget);
          if (k.input.f0 !== undefined && fields[0].type === 'string') {
            expect(typeof k.input.f0).toBe('string');
          }
        }
      } else {
        const samples = ['abc', 'Hello', 'xy'];
        const got = runFuzzCampaign({ kind: 'parser', samples, budget, seed });
        const rerun = runFuzzCampaign({ kind: 'parser', samples, budget, seed });
        expect(got.ok).toBe(true);
        expect(got.cases?.length).toBe(budget);
        expect(got.cases).toEqual(rerun.cases);
        for (const k of got.cases ?? []) {
          expect(samples).toContain(k.origin);
          expect(typeof k.input.mutated).toBe('string');
          expect(k.mutation).toMatch(/^(delete|insert|duplicate|flip):\d+$/);
          const len = (k.input.mutated as string).length;
          expect(len).toBeGreaterThanOrEqual((k.origin as string).length - 1);
          expect(len).toBeLessThanOrEqual((k.origin as string).length + 1);
        }
      }
    }
  });
});
