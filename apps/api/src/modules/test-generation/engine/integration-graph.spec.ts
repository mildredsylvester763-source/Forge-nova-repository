import { planIntegrationTests } from './integration-graph';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('integration-graph engine (FORGE TQ-032)', () => {
  it('plans a case per unique edge and a topological order', () => {
    const out = planIntegrationTests({
      services: ['billing', 'inventory', 'notify'],
      dependencies: [
        ['billing', 'inventory'],
        ['billing', 'notify'],
        ['inventory', 'notify'],
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.order).toEqual(['billing', 'inventory', 'notify']);
    expect(out.cases?.map((c) => c.name)).toEqual([
      'integrates:billing->inventory',
      'integrates:billing->notify',
      'integrates:inventory->notify',
    ]);
  });

  it('accepts object services, dedupes edges, and refuses cycles by name', () => {
    const out = planIntegrationTests({
      services: [{ name: 'a' }, { name: 'b' }],
      dependencies: [
        ['a', 'b'],
        ['a', 'b'],
      ],
    });
    expect(out.cases?.length).toBe(1);
    const cyc = planIntegrationTests({
      services: ['a', 'b'],
      dependencies: [
        ['a', 'b'],
        ['b', 'a'],
      ],
    });
    expect(cyc.reason).toBe('integration-cycle-detected:a->b->a');
  });

  it('refuses empty lists, duplicates, and unknown nodes by name', () => {
    expect(planIntegrationTests({ services: [], dependencies: [['a', 'b']] })).toMatchObject({
      reason: 'integration-services-empty',
    });
    expect(planIntegrationTests({ services: ['a', 'a'], dependencies: [['a', 'a']] })).toMatchObject({
      reason: 'integration-service-duplicate:a',
    });
    expect(planIntegrationTests({ services: ['a'], dependencies: [] })).toMatchObject({
      reason: 'integration-dependencies-empty',
    });
    expect(
      planIntegrationTests({ services: ['billing'], dependencies: [['billing', 'ghost']] }),
    ).toMatchObject({ reason: 'integration-node-unknown:ghost' });
    expect(
      planIntegrationTests({ services: ['a', ' '], dependencies: [['a', 'a']] }),
    ).toMatchObject({ reason: 'integration-service-name-missing' });
  });

  it('matches an independent oracle on 500 mulberry32(42) random graphs', () => {
    const rand = mulberry32(42);
    for (let c = 0; c < 500; c++) {
      const n = 1 + Math.floor(rand() * 5);
      const names: string[] = [];
      for (let i = 0; i < n; i++) names.push('s' + i);
      const deps: Array<[string, string]> = [];
      for (let i = 0; i < n * 2; i++) {
        deps.push([names[Math.floor(rand() * n)], names[Math.floor(rand() * n)]]);
      }
      const got = planIntegrationTests({ services: names, dependencies: deps });
      const oracleCases = new Set(deps.map((d) => d[0] + '->' + d[1]));
      const selfLoop = deps.some((d) => d[0] === d[1]);
      if (selfLoop) {
        expect(got.ok).toBe(false);
      }
      if (got.ok) {
        expect(got.cases?.length).toBe(oracleCases.size);
        expect(got.cases?.every((k) => oracleCases.has(k.from + '->' + k.to))).toBe(true);
        expect(new Set(got.order)).toEqual(new Set(names));
      } else {
        expect(got.reason).toContain('integration-cycle-detected:');
      }
    }
  });
});
