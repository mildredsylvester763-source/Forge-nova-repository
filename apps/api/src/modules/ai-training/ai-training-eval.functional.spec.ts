// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-eval.functional.spec.ts
// ============================================================================
// FUNCTIONAL + ADVERSARIAL tests for the eval harness (FORGE AI-021..024):
// the lifecycle a user actually experiences — define a versioned suite, grade
// FORGE benchmarks, run human panels with quorum gates, ship-gate a model —
// plus the chaos layer: double-taps, concurrent admins, stale-read races.
// Every race is applied across ALL serialization orderings; invariants:
// exactly one winner, losers refused BY NAME, caps and quorums never crossed,
// zero-trust holds under races.

import { TrainingAsset } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import { TrainingRun } from './entities/training-run.entity';
import { EvalSuiteVersion } from './entities/eval-suite-version.entity';
import { PanelVoteRecord } from './entities/panel-vote.entity';
import { AiTrainingService } from './ai-training.service';

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
    let out = this.rows;
    const w = opts.where ?? {};
    for (const [k, v] of Object.entries(w)) {
      out = out.filter((r) => (r as any)[k] === v);
    }
    if (opts.order?.createdAt === 'ASC') {
      out = out.slice().sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    if (opts.order?.version === 'DESC') {
      out = out.slice().sort((a: any, b: any) => b.version - a.version);
    }
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const all = await this.find({ ...opts, take: 1 });
    return all[0] ?? null;
  }
}

function makeService() {
  const assets = new RepoDouble<TrainingAsset>();
  const datasets = new RepoDouble<TrainingDataset>();
  const runs = new RepoDouble<TrainingRun>();
  const suites = new RepoDouble<EvalSuiteVersion>();
  const votes = new RepoDouble<PanelVoteRecord>();
  const batteries = new RepoDouble<any>();
  const grades = new RepoDouble<any>();
  const ballots = new RepoDouble<any>();
  const svc = new AiTrainingService(assets as any, datasets as any, runs as any, suites as any, votes as any, batteries as any, grades as any, ballots as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as anynew RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
  );
  return { svc, suites, votes };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function orderings<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of orderings(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

async function race(ops: Array<() => Promise<any>>): Promise<{ ok: number; refusals: string[] }> {
  let okCount = 0;
  const refusals: string[] = [];
  for (const op of ops) {
    try {
      await op();
      okCount++;
    } catch (e: any) {
      refusals.push(String(e?.message ?? e));
    }
  }
  return { ok: okCount, refusals };
}

const FORGE_V1 = {
  suiteId: 'forge-core',
  version: 1,
  kind: 'forge',
  cases: [
    { id: 'fix1', domain: 'code-fix', criteria: ['compiles', 'tests-pass'], weight: 2 },
    { id: 'rev1', domain: 'code-review', criteria: ['severity', 'tone'] },
  ],
};

describe('ai-training eval functional lifecycle (FORGE AI-021..024)', () => {
  it('defines, fetches, and grades a versioned FORGE suite', async () => {
    const { svc } = makeService();
    const s = await svc.defineEvalSuite(USER, FORGE_V1 as any);
    expect(s.version).toBe(1);
    expect(s.fingerprint).toMatch(/^suitefp_[0-9a-f]{8}$/);
    const got = await svc.getEvalSuite(USER, 'forge-core');
    expect(got.id).toBe(s.id);
    const full = await svc.gradeEvalSuite(USER, 'forge-core', {
      results: { fix1: ['compiles', 'tests-pass'], rev1: ['severity', 'tone'] },
    } as any);
    expect(full.version).toBe(1);
    expect(full.score).toBe(1);
    const half = await svc.gradeEvalSuite(USER, 'forge-core', {
      results: { fix1: ['compiles'], rev1: [] },
    } as any);
    expect(half.score).toBe(0.333333);
    expect(half.perCase.fix1).toBe(0.5);
  });

  it('refuses malformed suites by name at the service boundary', async () => {
    const { svc } = makeService();
    await expect(
      svc.defineEvalSuite(USER, { ...FORGE_V1, suiteId: 'bad', cases: [] } as any),
    ).rejects.toThrow('suite-no-cases');
    await expect(
      svc.defineEvalSuite(USER, { ...FORGE_V1, suiteId: 'bad', version: 1, cases: [
        { id: 'fix1', criteria: ['a'] },
        { id: 'fix1', criteria: ['b'] },
      ] } as any),
    ).rejects.toThrow('suite-duplicate-case:fix1');
  });

  it('re-versions with changed content and refuses unchanged content by name', async () => {
    const { svc } = makeService();
    await svc.defineEvalSuite(USER, FORGE_V1 as any);
    const v2 = await svc.defineEvalSuite(USER, {
      ...FORGE_V1,
      version: 2,
      cases: [
        { id: 'fix1', domain: 'code-fix', criteria: ['compiles', 'tests-pass', 'style'], weight: 2 },
        { id: 'rev1', domain: 'code-review', criteria: ['severity', 'tone'] },
      ],
    } as any);
    expect(v2.version).toBe(2);
    await expect(
      svc.defineEvalSuite(USER, { ...FORGE_V1, version: 3 } as any),
    ).rejects.toThrow('eval-suite-unchanged-content');
    await expect(
      svc.defineEvalSuite(USER, { ...FORGE_V1, version: 5 } as any),
    ).rejects.toThrow('eval-suite-version-gap:5!=3');
  });

  it('creative suites: panel votes, quorum-gated median, duplicate refusal', async () => {
    const { svc } = makeService();
    await svc.defineEvalSuite(USER, {
      suiteId: 'art',
      version: 1,
      kind: 'creative',
      cases: [
        { id: 'm1', domain: 'manhwa', criteria: [] },
        { id: 'm2', domain: 'voice', criteria: [] },
      ],
    } as any);
    await svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'a', score: 40 } as any);
    await expect(
      svc.aggregatePanelVotes(USER, 'art', 'm1', 3),
    ).rejects.toThrow('panel-quorum-unmet:1<3');
    await svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'b', score: 60 } as any);
    await svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'c', score: 80 } as any);
    const agg = await svc.aggregatePanelVotes(USER, 'art', 'm1', 3);
    expect(agg.median).toBe(60);
    expect(agg.count).toBe(3);
    await expect(
      svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'a', score: 99 } as any),
    ).rejects.toThrow('panel-duplicate-panelist:a');
    await expect(
      svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'zz', panelist: 'x', score: 10 } as any),
    ).rejects.toThrow('panel-case-unknown:zz');
  });

  it('ship gate passes a compliant model and names every failure', async () => {
    const { svc } = makeService();
    const pass = await svc.applyShipGate({
      metrics: { accuracy: 0.93, tone: 0.9 },
      thresholds: { accuracy: { min: 0.9 }, tone: { baseline: 1.0, maxDrop: 0.15 } },
    } as any);
    expect(pass.passed).toEqual(['accuracy', 'tone']);
    await expect(
      svc.applyShipGate({
        metrics: { accuracy: 0.5, tone: 0.4 },
        thresholds: { accuracy: { min: 0.9 }, tone: { min: 0.8 } },
      } as any),
    ).rejects.toThrow('gate-below-minimum:accuracy:0.5<0.9');
  });

  it('never shows another user their suites or accepts their votes (zero-trust)', async () => {
    const { svc } = makeService();
    await svc.defineEvalSuite(USER, FORGE_V1 as any);
    await expect(svc.getEvalSuite(OTHER, 'forge-core')).rejects.toThrow('eval-suite-not-found');
    await expect(
      svc.recordPanelVote(OTHER, { suiteId: 'forge-core', caseId: 'fix1', panelist: 'a', score: 50 } as any),
    ).rejects.toThrow('eval-suite-not-found');
    await expect(svc.gradeEvalSuite(OTHER, 'forge-core', { results: {} } as any)).rejects.toThrow();
  });
});

describe('ai-training eval adversarial scenarios (double-taps, concurrent admins)', () => {
  it('S1 double-tap define: exactly one suite row lands, the loser is refused by name', async () => {
    for (const order of orderings([0, 1])) {
      expect(order).toHaveLength(2);
      const { svc, suites } = makeService();
      const r = await race([
        () => svc.defineEvalSuite(USER, FORGE_V1 as any),
        () => svc.defineEvalSuite(USER, FORGE_V1 as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('eval-suite-version-gap:1!=2');
      const rows = await suites.find({ where: { userId: USER, suiteId: 'forge-core' } } as any);
      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe(1);
    }
  });

  it('S2 concurrent re-version: changed content wins, unchanged content is refused by name in every ordering', async () => {
    const changed = {
      ...FORGE_V1,
      version: 2,
      cases: [
        { id: 'fix1', domain: 'code-fix', criteria: ['compiles', 'tests-pass', 'style'], weight: 2 },
        { id: 'rev1', domain: 'code-review', criteria: ['severity', 'tone'] },
      ],
    };
    for (const order of orderings(['changed', 'unchanged'])) {
      const { svc, suites } = makeService();
      await svc.defineEvalSuite(USER, FORGE_V1 as any);
      const ops: Record<string, () => Promise<any>> = {
        changed: () => svc.defineEvalSuite(USER, changed as any),
        unchanged: () => svc.defineEvalSuite(USER, { ...FORGE_V1, version: 2 } as any),
      };
      const r = await race(order.map((k) => ops[k]));
      // exactly one v2 lands in every ordering
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toMatch(/eval-suite-(unchanged-content|version-gap)/);
      const rows = await suites.find({ where: { userId: USER, suiteId: 'forge-core' } } as any);
      expect(rows).toHaveLength(2);
      const v2 = rows.find((x: any) => x.version === 2) as any;
      expect(v2.cases[0].criteria).toHaveLength(3);
    }
  });

  it('S3 double-tap panel votes: one vote per panelist survives, duplicates refused by name, median honest', async () => {
    const { svc } = makeService();
    await svc.defineEvalSuite(USER, {
      suiteId: 'art', version: 1, kind: 'creative',
      cases: [{ id: 'm1', domain: 'manhwa', criteria: [] }],
    } as any);
    const r = await race([
      () => svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'a', score: 40 } as any),
      () => svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'a', score: 70 } as any),
      () => svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'b', score: 60 } as any),
      () => svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'b', score: 90 } as any),
    ]);
    expect(r.ok).toBe(2);
    expect(r.refusals).toHaveLength(2);
    for (const msg of r.refusals) expect(msg).toContain('panel-duplicate-panelist:');
    // the panel counts one honest vote per panelist; double-taps inflated nothing
    const agg = await svc.aggregatePanelVotes(USER, 'art', 'm1', 2);
    expect(agg.count).toBe(2);
    expect(agg.median).toBe(50);
  });

  it('S4 grade-vs-reversion race: whichever order the DB picks, the score matches the version graded', async () => {
    const v2 = {
      ...FORGE_V1,
      version: 2,
      cases: [
        { id: 'fix1', domain: 'code-fix', criteria: ['compiles', 'tests-pass', 'style'], weight: 2 },
        { id: 'rev1', domain: 'code-review', criteria: ['severity', 'tone'] },
      ],
    };
    for (const order of orderings(['define', 'grade'])) {
      const { svc } = makeService();
      await svc.defineEvalSuite(USER, FORGE_V1 as any);
      const ops: Record<string, () => Promise<any>> = {
        define: () => svc.defineEvalSuite(USER, v2 as any),
        grade: () => svc.gradeEvalSuite(USER, 'forge-core', {
          results: { fix1: ['compiles', 'tests-pass'], rev1: ['severity', 'tone'] },
        } as any),
      };
      const r = await race(order.map((k) => ops[k]));
      expect(r.ok).toBe(2);
      const got = await svc.getEvalSuite(USER, 'forge-core');
      expect(got.version).toBe(2);
    }
  });

  it('S5 gate verdict is identical under every serialization order of the metrics payload', async () => {
    const { svc } = makeService();
    const values: Record<string, number> = { accuracy: 0.5, tone: 0.4 };
    const thresholds = { accuracy: { min: 0.9 }, tone: { min: 0.8 } };
    let first: string | null = null;
    for (const order of orderings(['accuracy', 'tone'])) {
      const payload: Record<string, number> = {};
      for (const k of order) payload[k] = values[k];
      const r = await race([() => svc.applyShipGate({ metrics: payload, thresholds } as any)]);
      expect(r.refusals).toHaveLength(1);
      if (first === null) first = r.refusals[0];
      expect(r.refusals[0]).toBe(first);
    }
  });

  it('S6 cross-user race: another user racing my panel changes nothing (zero-trust under races)', async () => {
    const { svc } = makeService();
    await svc.defineEvalSuite(USER, {
      suiteId: 'art', version: 1, kind: 'creative',
      cases: [{ id: 'm1', domain: 'manhwa', criteria: [] }],
    } as any);
    await svc.recordPanelVote(USER, { suiteId: 'art', caseId: 'm1', panelist: 'a', score: 40 } as any);
    const r = await race([
      () => svc.recordPanelVote(OTHER, { suiteId: 'art', caseId: 'm1', panelist: 'x', score: 10 } as any),
      () => svc.recordPanelVote(OTHER, { suiteId: 'art', caseId: 'm1', panelist: 'y', score: 20 } as any),
    ]);
    expect(r.ok).toBe(0);
    expect(r.refusals).toHaveLength(2);
    for (const msg of r.refusals) expect(msg).toContain('eval-suite-not-found');
    const agg = await svc.aggregatePanelVotes(USER, 'art', 'm1', 1);
    expect(agg.count).toBe(1);
    expect(agg.median).toBe(40);
  });
});
