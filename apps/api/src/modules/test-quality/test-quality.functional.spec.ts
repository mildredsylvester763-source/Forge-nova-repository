// Functional spec for the test-quality module (FORGE TQ-036..040).
// RepoDouble stands in for the TypeORM repository; the engines are already
// pinned by their own specs, so this spec pins the service laws: sync
// wrappers throw named refusals, golden methods reject with the same
// names, and stored goldens are isolated per user.

import { Repository } from 'typeorm';
import { TestQualityGolden } from './entities/test-quality-golden.entity';
import { TestQualityService } from './test-quality.service';

class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;

  create(partial: Partial<T>): T {
    return { ...partial } as T;
  }

  async save(row: T): Promise<T> {
    const stampable = row as unknown as { id?: string; createdAt?: Date; updatedAt?: Date };
    if (!stampable.createdAt) stampable.createdAt = new Date();
    if (!stampable.updatedAt) stampable.updatedAt = new Date();
    if (!stampable.id) {
      stampable.id = 'row-' + ++this.seq;
      this.rows.push(row);
    } else {
      const idx = this.rows.findIndex((r) => (r as { id?: string }).id === stampable.id);
      if (idx >= 0) this.rows[idx] = row;
      else this.rows.push(row);
    }
    return row;
  }

  async find(opts?: { where?: Record<string, unknown>; order?: Record<string, string>; take?: number }): Promise<T[]> {
    let out = this.rows.slice();
    const where = opts?.where ?? {};
    for (const key of Object.keys(where)) {
      out = out.filter((r) => (r as Record<string, unknown>)[key] === where[key]);
    }
    if (opts?.order?.createdAt === 'DESC') {
      out = out.slice().sort((a, b) =>
        String((b as Record<string, unknown>).createdAt).localeCompare(
          String((a as Record<string, unknown>).createdAt),
        ),
      );
    }
    if (opts?.take) out = out.slice(0, opts.take);
    return out;
  }

  async findOne(opts?: { where?: Record<string, unknown> }): Promise<T | null> {
    const all = await this.find({ where: opts?.where });
    return all[0] ?? null;
  }
}

function makeService() {
  const goldens = new RepoDouble<TestQualityGolden>();
  const svc = new TestQualityService(goldens as unknown as Repository<TestQualityGolden>);
  return { svc, goldens };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('test-quality functional lifecycle (FORGE TQ-036..040)', () => {
  it('exposes the catalogs synchronously', () => {
    const { svc } = makeService();
    expect(svc.listMutationOperators()).toEqual([
      'flip-boolean',
      'arith-swap',
      'comparison-shift',
      'number-zero',
      'string-empty',
      'logical-swap',
    ]);
    expect(svc.listSnapshotModes()).toEqual(['write', 'verify', 'update']);
    const catalogs = svc.listMatrixCatalogs();
    expect(catalogs.browsers).toEqual(['chrome', 'firefox', 'safari', 'edge']);
    expect(catalogs.platforms).toEqual(['desktop', 'android', 'ios']);
    expect(catalogs.viewports).toEqual(['1280x720', '1920x1080', '375x667', '768x1024']);
    expect(catalogs.statuses).toEqual(['pass', 'fail', 'skip']);
  });

  it('throws named refusals from the sync wrappers', () => {
    const { svc } = makeService();
    expect(() => svc.planMutants({ source: [] })).toThrow('mutation-source-empty');
    expect(() => svc.planMutants({ source: ['const a = 1;'], operators: ['dance'] })).toThrow(
      'mutation-operator-unknown:dance',
    );
    expect(() => svc.scoreMutants({ mutants: [], results: {} })).toThrow('mutation-mutants-empty');
    expect(() => svc.scoreMutants({ mutants: [{ id: 'm1' }], results: { m1: 'escaped' } })).toThrow(
      'mutation-state-invalid:escaped:m1',
    );
    expect(() =>
      svc.buildPact({
        consumer: '',
        provider: 'billing',
        interactions: [
          { description: 'get invoice', request: { method: 'get', path: '/api/invoices/7' }, response: { status: 200 } },
        ],
      }),
    ).toThrow('contract-consumer-missing');
    expect(() =>
      svc.verifyContract({
        consumer: 'shop',
        provider: 'billing',
        interactions: [
          { description: 'get invoice', request: { method: 'get', path: '/api/invoices/7' }, response: { status: 200 } },
        ],
        providerResponses: [],
      }),
    ).toThrow('contract-responses-missing');
    expect(() =>
      svc.diffImages({
        baseline: { width: 1, height: 1, pixels: ['#000000'] },
        candidate: { width: 2, height: 1, pixels: ['#000000', '#000000'] },
      }),
    ).toThrow('visual-size-mismatch:1x1:2x1');
    expect(() => svc.planMatrix({ browsers: ['opera'] })).toThrow('matrix-browser-unknown:opera');
    expect(() => svc.scoreMatrix({ combos: [], results: {} })).toThrow('matrix-combos-empty');
  });

  it('plans and scores mutants end to end', () => {
    const { svc } = makeService();
    const plan = svc.planMutants({ source: ['const a = 1 + 2;', 'return a > 10 && ok;'] });
    expect(plan.count).toBe(5);
    expect(plan.mutants?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(plan.mutants?.[0].mutated).toBe('const a = 1 - 2;');
    const report = svc.scoreMutants({
      mutants: plan.mutants ?? [],
      results: { m1: 'killed', m2: 'killed', m3: 'survived', m4: 'timeout', m5: 'killed' },
    });
    expect(report.total).toBe(5);
    expect(report.detected).toBe(4);
    expect(report.score).toBe(80);
    expect(report.passed).toBe(true);
    const breach = svc.scoreMutants({
      mutants: plan.mutants ?? [],
      results: { m1: 'killed', m2: 'killed', m3: 'survived', m4: 'killed', m5: 'survived' },
      threshold: 90,
    });
    expect(breach.passed).toBe(false);
  });

  it('builds and verifies pacts with normalization and subset bodies', () => {
    const { svc } = makeService();
    const interactions = [
      {
        description: 'get invoice',
        request: { method: 'get', path: 'api/invoices/7' },
        response: { status: 200, body: { id: 7, total: 42 } },
      },
    ];
    const pact = svc.buildPact({ consumer: 'shop', provider: 'billing', interactions });
    expect(pact.count).toBe(1);
    expect(pact.interactions?.[0].request.path).toBe('/api/invoices/7');
    expect(pact.interactions?.[0].request.method).toBe('GET');
    const verified = svc.verifyContract({
      consumer: 'shop',
      provider: 'billing',
      interactions,
      providerResponses: [
        { method: 'GET', path: '//api//invoices/7', status: 200, body: { id: 7, total: 42, extra: 'ok' } },
      ],
    });
    expect(verified.verified).toBe(1);
    expect(() =>
      svc.verifyContract({
        consumer: 'shop',
        provider: 'billing',
        interactions,
        providerResponses: [{ method: 'GET', path: '/api/missing', status: 200 }],
      }),
    ).toThrow('contract-route-missing:1:GET:/api/invoices/7');
    expect(() =>
      svc.verifyContract({
        consumer: 'shop',
        provider: 'billing',
        interactions,
        providerResponses: [{ method: 'GET', path: '/api/invoices/7', status: 200, body: { id: 8 } }],
      }),
    ).toThrow('contract-body-mismatch:1:$.id');
    expect(() =>
      svc.verifyContract({
        consumer: 'shop',
        provider: 'billing',
        interactions,
        providerResponses: [{ method: 'GET', path: '/api/invoices/7', status: 404 }],
      }),
    ).toThrow('contract-status-mismatch:1:200:404');
  });

  it('writes, verifies and updates goldens per user', async () => {
    const { svc, goldens } = makeService();
    const written = await svc.writeGolden(USER, { name: 'invoice-list', value: { b: 2, a: [1, 2] } });
    expect(written.name).toBe('invoice-list');
    expect(written.checksum).toBe('25b2a167');
    expect(written.lines).toBe(7);
    expect(goldens.rows).toHaveLength(1);
    expect(goldens.rows[0].userId).toBe(USER);
    expect(goldens.rows[0].content).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": 2\n}');
    await expect(svc.writeGolden(USER, { name: 'invoice-list', value: { b: 2 } })).rejects.toThrow(
      'snapshot-exists:invoice-list',
    );
    const matched = await svc.verifyGolden(USER, { name: 'invoice-list', value: { a: [1, 2], b: 2 } });
    expect(matched.status).toBe('match');
    expect(matched.checksum).toBe('25b2a167');
    await expect(svc.verifyGolden(USER, { name: 'invoice-list', value: { a: [1, 3], b: 2 } })).rejects.toThrow(
      'snapshot-mismatch:invoice-list',
    );
    const updated = await svc.updateGolden(USER, { name: 'invoice-list', value: { b: 3, a: [] } });
    expect(updated.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(goldens.rows[0].content).toBe('{\n  "a": [],\n  "b": 3\n}');
    const reverified = await svc.verifyGolden(USER, { name: 'invoice-list', value: { a: [], b: 3 } });
    expect(reverified.status).toBe('match');
    await expect(svc.updateGolden(USER, { name: 'missing-golden', value: { x: 1 } })).rejects.toThrow(
      'snapshot-missing:missing-golden',
    );
    await expect(svc.verifyGolden(OTHER, { name: 'invoice-list', value: { b: 3, a: [] } })).rejects.toThrow(
      'snapshot-missing:invoice-list',
    );
    const otherWrite = await svc.writeGolden(OTHER, { name: 'invoice-list', value: { b: 9 } });
    expect(otherWrite.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(goldens.rows).toHaveLength(2);
    const mine = await svc.listGoldens(USER);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('invoice-list');
    expect(await svc.listGoldens(OTHER)).toHaveLength(1);
  });

  it('diffs images with ignore regions and thresholds', () => {
    const { svc } = makeService();
    const baseline = { width: 2, height: 2, pixels: ['#000000', '#000000', '#000000', '#000000'] };
    const candidate = { width: 2, height: 2, pixels: ['#ff0000', '#000000', '#000000', '#000000'] };
    const diff = svc.diffImages({ baseline, candidate });
    expect(diff.different).toBe(1);
    expect(diff.diffPercent).toBe(25);
    expect(diff.identical).toBe(false);
    const masked = svc.diffImages({ baseline, candidate, ignoreRegions: [{ x: 0, y: 0, width: 1, height: 1 }] });
    expect(masked.ignored).toBe(1);
    expect(masked.different).toBe(0);
    expect(masked.diffPercent).toBe(0);
    expect(masked.identical).toBe(true);
    const tolerant = svc.diffImages({
      baseline,
      candidate: { width: 2, height: 2, pixels: ['#0a0000', '#000000', '#000000', '#000000'] },
      threshold: 1,
    });
    expect(tolerant.identical).toBe(true);
    expect(() =>
      svc.diffImages({
        baseline: { width: 1, height: 1, pixels: ['nope'] },
        candidate: { width: 1, height: 1, pixels: ['#000000'] },
      }),
    ).toThrow('visual-pixel-invalid:baseline:1');
  });

  it('plans and scores the cross-browser matrix', () => {
    const { svc } = makeService();
    const plan = svc.planMatrix({});
    expect(plan.count).toBe(44);
    expect(plan.unsupportedSkipped).toBe(4);
    const focused = svc.planMatrix({
      browsers: ['chrome'],
      platforms: ['desktop'],
      viewports: ['1280x720', '375x667'],
    });
    expect(focused.count).toBe(2);
    const scored = svc.scoreMatrix({ combos: focused.combos ?? [], results: { c1: 'pass', c2: 'fail' } });
    expect(scored.coverage).toBe(100);
    expect(scored.meets).toBe(false);
    const allPass = svc.scoreMatrix({ combos: focused.combos ?? [], results: { c1: 'pass', c2: 'pass' } });
    expect(allPass.meets).toBe(true);
    const withSkip = svc.scoreMatrix({
      combos: focused.combos ?? [],
      results: { c1: 'pass', c2: 'skip' },
      threshold: 50,
    });
    expect(withSkip.coverage).toBe(50);
    expect(withSkip.meets).toBe(true);
    expect(() => svc.scoreMatrix({ combos: focused.combos ?? [], results: { c1: 'pass', c2: 'danced' } })).toThrow(
      'matrix-status-invalid:danced:c2',
    );
  });
});
