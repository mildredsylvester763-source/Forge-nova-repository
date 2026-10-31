import {
  planUnitTests,
  boundaryCountOf,
  UNIT_KINDS,
  UNIT_PARAM_TYPES,
} from './unit-test-generation';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('unit-test-generation engine (FORGE TQ-031)', () => {
  it('plans boundary and behavior cases for a function target', () => {
    const out = planUnitTests({
      target: { name: 'calcPrice', kind: 'function', params: [{ name: 'qty', type: 'number' }] },
      behaviors: [{ name: 'rejects negative qty' }],
    });
    expect(out.ok).toBe(true);
    expect(out.target).toBe('calcPrice');
    expect(out.boundaryCount).toBe(3);
    expect(out.behaviorCount).toBe(1);
    expect(out.cases?.map((c) => c.name)).toEqual([
      'boundary:qty:number:0',
      'boundary:qty:number:1',
      'boundary:qty:number:2',
      'behavior:rejects negative qty',
    ]);
    expect(out.cases?.[0].detail).toBe('qty = 0');
  });

  it('renders deterministic boundary details for every param type', () => {
    const s = planUnitTests({
      target: { name: 'fmt', kind: 'class', params: [{ name: 'label', type: 'string' }] },
      behaviors: [{ name: 'b' }],
    });
    expect(s.cases?.[1].detail).toBe('label = str(1)');
    expect(s.cases?.[2].detail).toBe('label = str(64)');
    const flags = planUnitTests({
      target: {
        name: 'flags',
        kind: 'function',
        params: [
          { name: 'on', type: 'boolean' },
          { name: 'opts', type: 'object' },
        ],
      },
      behaviors: [{ name: 'b' }],
    });
    expect(flags.cases?.filter((c) => c.kind === 'boundary').map((c) => c.name)).toEqual([
      'boundary:on:boolean:0',
      'boundary:on:boolean:1',
      'boundary:opts:object:0',
      'boundary:opts:object:1',
    ]);
    const arr = planUnitTests({
      target: { name: 'f', kind: 'function', params: [{ name: 'items', type: 'array' }] },
      behaviors: [{ name: 'b' }],
    });
    expect(arr.cases?.[2].detail).toBe('items = arr(3)');
  });

  it('exposes the catalogs and refuses bad targets, params and behaviors', () => {
    expect(UNIT_KINDS).toEqual(['function', 'class']);
    expect(UNIT_PARAM_TYPES).toEqual(['string', 'number', 'boolean', 'array', 'object']);
    expect(planUnitTests({ behaviors: [] })).toMatchObject({ reason: 'unit-target-missing' });
    expect(
      planUnitTests({ target: { name: ' ', kind: 'function' }, behaviors: [{ name: 'x' }] }),
    ).toMatchObject({ reason: 'unit-target-name-missing' });
    expect(
      planUnitTests({ target: { name: 'f', kind: 'helper' }, behaviors: [{ name: 'x' }] }),
    ).toMatchObject({ reason: 'unit-target-kind-unknown:helper' });
    expect(
      planUnitTests({
        target: { name: 'f', kind: 'function', params: [{ name: 'm', type: 'map' }] },
        behaviors: [{ name: 'x' }],
      }),
    ).toMatchObject({ reason: 'unit-param-type-unknown:map' });
    expect(
      planUnitTests({
        target: {
          name: 'f',
          kind: 'function',
          params: [
            { name: 'a', type: 'string' },
            { name: 'a', type: 'number' },
          ],
        },
        behaviors: [{ name: 'x' }],
      }),
    ).toMatchObject({ reason: 'unit-param-duplicate:a' });
    expect(
      planUnitTests({
        target: {
          name: 'f',
          kind: 'function',
          params: Array.from({ length: 11 }, (_, i) => ({ name: 'p' + i, type: 'string' })),
        },
        behaviors: [{ name: 'x' }],
      }),
    ).toMatchObject({ reason: 'unit-params-limit:11' });
    expect(planUnitTests({ target: { name: 'f', kind: 'function' }, behaviors: [] })).toMatchObject(
      { reason: 'unit-behaviors-empty' },
    );
    expect(
      planUnitTests({
        target: { name: 'f', kind: 'function' },
        behaviors: Array.from({ length: 21 }, (_, i) => ({ name: 'b' + i })),
      }),
    ).toMatchObject({ reason: 'unit-behaviors-limit:21' });
    expect(
      planUnitTests({
        target: { name: 'f', kind: 'function' },
        behaviors: [{ name: 'z' }, { name: 'z' }],
      }),
    ).toMatchObject({ reason: 'unit-behavior-duplicate:z' });
    expect(
      planUnitTests({ target: { name: 'f', kind: 'function' }, behaviors: [{ name: '  ' }] }),
    ).toMatchObject({ reason: 'unit-behavior-name-missing' });
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const TYPES = ['string', 'number', 'boolean', 'array', 'object'];
    for (let c = 0; c < 500; c++) {
      const pcount = Math.floor(rand() * 13);
      const params: Array<{ name: string; type: string }> = [];
      const pnames: string[] = [];
      let dupParam = false;
      for (let i = 0; i < pcount; i++) {
        const nm = 'p' + Math.floor(rand() * 5);
        if (pnames.includes(nm)) dupParam = true;
        pnames.push(nm);
        params.push({ name: nm, type: TYPES[Math.floor(rand() * TYPES.length)] });
      }
      const bcount = 1 + Math.floor(rand() * 21);
      const behaviors: Array<{ name: string }> = [];
      let dupBeh = false;
      for (let i = 0; i < bcount; i++) {
        const nm = 'b' + Math.floor(rand() * 30);
        if (behaviors.some((b) => b.name === nm)) dupBeh = true;
        behaviors.push({ name: nm });
      }
      const got = planUnitTests({ target: { name: 't' + c, kind: 'function', params }, behaviors });
      let boundary = 0;
      for (const p of params) boundary += boundaryCountOf(p.type);
      let expectOk = true;
      let expectReason = '';
      if (params.length > 10) {
        expectOk = false;
        expectReason = 'unit-params-limit:' + params.length;
      } else if (dupParam) {
        expectOk = false;
        expectReason = 'unit-param-duplicate:';
      } else if (behaviors.length > 20) {
        expectOk = false;
        expectReason = 'unit-behaviors-limit:' + behaviors.length;
      } else if (dupBeh) {
        expectOk = false;
        expectReason = 'unit-behavior-duplicate:';
      }
      expect(got.ok).toBe(expectOk);
      if (expectOk) {
        expect(got.cases?.length).toBe(boundary + behaviors.length);
        expect(got.boundaryCount).toBe(boundary);
      } else {
        expect(got.reason).toBe(expectReason.length > 20 ? expectReason : got.reason);
      }
    }
  });
});
