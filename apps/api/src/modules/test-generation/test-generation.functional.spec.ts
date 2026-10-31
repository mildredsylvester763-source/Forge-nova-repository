// ============================================================================
// FILE: /apps/api/src/modules/test-generation/test-generation.functional.spec.ts
// ============================================================================
// FUNCTIONAL tests for test generation (FORGE TQ-031..035): the behavior a
// user actually experiences over behavior-true repository doubles: unit
// suites from boundary analysis, integration suites from the service
// graph, e2e suites from recorded sessions, seeded property suites, and
// budgeted fuzz campaigns. All suites are per-user with FNV-1a checksums.

import { GeneratedSuite } from './entities/generated-suite.entity';
import { TestGenerationService } from './test-generation.service';

// ---- minimal TypeORM repository double (behavior-true, no DB needed) ----
class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: T): Promise<T> {
    if (!(row as any).createdAt) (row as any).createdAt = new Date();
    if (!(row as any).updatedAt) (row as any).updatedAt = new Date();
    if (!row.id) {
      row.id = 'row-' + ++this.seq;
      this.rows.push(row);
    } else {
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) this.rows[i] = row;
      else this.rows.push(row);
    }
    return row;
  }
  async find(opts: any = {}): Promise<T[]> {
    let out = this.rows.slice();
    const w = opts.where ?? {};
    for (const [k, v] of Object.entries(w)) {
      out = out.filter((r) => (r as any)[k] === v);
    }
    if (opts.order?.createdAt === 'DESC') {
      out = out
        .slice()
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    if (opts.take) out = out.slice(0, opts.take);
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const all = await this.find({ ...opts });
    return all[0] ?? null;
  }
}

function makeService() {
  const suites = new RepoDouble<GeneratedSuite>();
  const svc = new TestGenerationService(suites as any);
  return { svc, suites };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('test-generation functional lifecycle (FORGE TQ-031..035)', () => {
  it('exposes the catalogs synchronously', () => {
    const { svc } = makeService();
    expect(svc.listUnitKinds()).toEqual(['function', 'class']);
    expect(svc.listUnitParamTypes()).toEqual(['string', 'number', 'boolean', 'array', 'object']);
    expect(svc.listE2eActions()).toEqual(['navigate', 'click', 'type', 'wait', 'assert']);
    expect(svc.listFuzzKinds()).toEqual(['api', 'parser', 'format']);
    expect(svc.listFuzzFieldTypes()).toEqual(['string', 'int', 'bool', 'uuid']);
  });

  it('generates, checksums and persists unit suites', async () => {
    const { svc, suites } = makeService();
    const out = await svc.generateUnitTests(USER, {
      target: { name: 'calcPrice', kind: 'function', params: [{ name: 'qty', type: 'number' }] },
      behaviors: [{ name: 'rejects negative qty' }],
    } as any);
    expect(out.kind).toBe('unit');
    expect(out.target).toBe('calcPrice');
    expect(out.count).toBe(4);
    expect(out.checksum).toHaveLength(8);
    expect(out.id).toBeTruthy();
    expect(suites.rows).toHaveLength(1);
    expect(suites.rows[0].userId).toBe(USER);
    expect(suites.rows[0].seed).toBe(42);

    const same = await svc.generateUnitTests(USER, {
      target: { name: 'calcPrice', kind: 'function', params: [{ name: 'qty', type: 'number' }] },
      behaviors: [{ name: 'rejects negative qty' }],
    } as any);
    expect(same.checksum).toBe(out.checksum);
    expect(same.id).not.toBe(out.id);
    expect(suites.rows).toHaveLength(2);

    await expect(
      svc.generateUnitTests(USER, {
        target: { name: 'f', kind: 'helper' },
        behaviors: [{ name: 'x' }],
      } as any),
    ).rejects.toThrow('unit-target-kind-unknown:helper');
    expect(suites.rows).toHaveLength(2);
  });

  it('plans integration suites over the service graph', async () => {
    const { svc, suites } = makeService();
    const out = await svc.generateIntegrationTests(USER, {
      services: ['billing', 'inventory', 'notify'],
      dependencies: [
        ['billing', 'inventory'],
        ['billing', 'notify'],
        ['inventory', 'notify'],
      ],
    } as any);
    expect(out.kind).toBe('integration');
    expect(out.target).toBe('billing+inventory+notify');
    expect(out.count).toBe(3);
    expect((out.cases as any)[0].name).toBe('integrates:billing->inventory');
    expect(suites.rows).toHaveLength(1);

    await expect(
      svc.generateIntegrationTests(USER, {
        services: ['a', 'a'],
        dependencies: [['a', 'a']],
      } as any),
    ).rejects.toThrow('integration-service-duplicate:a');
    expect(suites.rows).toHaveLength(1);
  });

  it('replays recorded sessions into e2e suites', async () => {
    const { svc } = makeService();
    const out = await svc.generateE2eSuite(USER, {
      session: { name: 'checkout' },
      steps: [
        { action: 'navigate', target: '/', value: '' },
        { action: 'click', target: 'add-to-cart', value: '' },
        { action: 'click', target: 'add-to-cart', value: '' },
        { action: 'type', target: '#email', value: 'a@b.c' },
        { action: 'assert', target: 'cart badge 1', value: '' },
        { action: 'click', target: 'buy', value: '', checkpoint: true },
      ],
    } as any);
    expect(out.kind).toBe('e2e');
    expect(out.target).toBe('checkout');
    expect(out.count).toBe(5);
    expect((out.cases as any).map((c: any) => c.action)).toEqual([
      'navigate',
      'click',
      'type',
      'assert',
      'click',
    ]);

    await expect(
      svc.generateE2eSuite(USER, {
        session: { name: 's' },
        steps: [{ action: 'scroll', target: 'x' }],
      } as any),
    ).rejects.toThrow('e2e-action-unknown:scroll');
  });

  it('stores seeded property suites with repro commands', async () => {
    const { svc } = makeService();
    const out = await svc.planPropertySuite(USER, { name: 'sorts idempotently' } as any);
    expect(out.kind).toBe('property');
    expect(out.target).toBe('sorts idempotently');
    expect(out.count).toBe(1);
    expect((out.cases as any)[0].repro).toBe('property:sorts idempotently seed:42 runs:100');

    await expect(
      svc.planPropertySuite(USER, { name: 'x', runs: 0 } as any),
    ).rejects.toThrow('property-runs-invalid:0');
  });

  it('runs budgeted fuzz campaigns with deterministic cases', async () => {
    const { svc } = makeService();
    const out = await svc.runFuzzCampaign(USER, {
      kind: 'api',
      fields: [
        { name: 'email', type: 'string', required: true },
        { name: 'age', type: 'int' },
      ],
      budget: 3,
      seed: 42,
    } as any);
    expect(out.kind).toBe('fuzz');
    expect(out.target).toBe('api');
    expect(out.count).toBe(3);
    expect(out.cases).toEqual([
      { index: 0, input: { email: 'lwrenhqw', age: 249 } },
      { index: 1, input: { email: 'thfnrpamvbp' } },
      { index: 2, input: { email: 'beun' } },
    ]);

    await expect(
      svc.runFuzzCampaign(USER, { kind: 'parser', samples: [''] } as any),
    ).rejects.toThrow('fuzz-sample-invalid');
  });

  it('isolates suites per user and refuses unknown suite ids', async () => {
    const { svc } = makeService();
    const out = await svc.generateUnitTests(USER, {
      target: { name: 'calcPrice', kind: 'function', params: [{ name: 'qty', type: 'number' }] },
      behaviors: [{ name: 'rejects negative qty' }],
    } as any);
    expect(await svc.listSuites(USER)).toHaveLength(1);
    expect(await svc.listSuites(OTHER)).toHaveLength(0);
    await expect(svc.getSuite(OTHER, out.id)).rejects.toThrow('suite-not-found:' + out.id);
    const mine = await svc.getSuite(USER, out.id);
    expect(mine.kind).toBe('unit');
    expect(mine.cases).toHaveLength(4);
  });
});
