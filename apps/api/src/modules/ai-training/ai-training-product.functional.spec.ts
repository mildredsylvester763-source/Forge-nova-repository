// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-product.functional.spec.ts
// ============================================================================
// FUNCTIONAL + ADVERSARIAL tests for the product experiment stack (FORGE
// AI-029..032): the lifecycle a user actually experiences — define a
// consent-gated experiment, assign subjects deterministically, record
// exactly-one outcomes, tally with an honest samples floor, build agent
// scorecards, keep append-only trend history, mine failures into capped
// training batches — plus the chaos layer: double-taps, races between
// assign/outcome/tally, cross-user zero-trust. Every race is applied across
// ALL serialization orderings; invariants: exactly one winner when
// operations conflict, losers refused BY NAME, assignments never drift,
// outcomes land exactly once, caps never crossed silently.

import { TrainingAsset } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import { TrainingRun } from './entities/training-run.entity';
import { EvalSuiteVersion } from './entities/eval-suite-version.entity';
import { PanelVoteRecord } from './entities/panel-vote.entity';
import { SafetyProbeBattery } from './entities/safety-battery.entity';
import { SafetyRunGrade } from './entities/safety-run-grade.entity';
import { BlindBallot } from './entities/blind-ballot.entity';
import { ProductExperiment } from './entities/experiment.entity';
import { ProductExperimentSubject } from './entities/experiment-subject.entity';
import { ProductAgentEvent } from './entities/agent-event.entity';
import { EvalTrendSample } from './entities/eval-trend.entity';
import { FailureMiningBatch } from './entities/mining-batch.entity';
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
  const batteries = new RepoDouble<SafetyProbeBattery>();
  const grades = new RepoDouble<SafetyRunGrade>();
  const ballots = new RepoDouble<BlindBallot>();
  const experiments = new RepoDouble<ProductExperiment>();
  const subjects = new RepoDouble<ProductExperimentSubject>();
  const events = new RepoDouble<ProductAgentEvent>();
  const trends = new RepoDouble<EvalTrendSample>();
  const batches = new RepoDouble<FailureMiningBatch>();
  const svc = new AiTrainingService(
    assets as any, datasets as any, runs as any, suites as any, votes as any,
    batteries as any, grades as any, ballots as any,
    experiments as any, subjects as any, events as any, trends as any, batches as any,
  new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any,
    new RepoDouble<any>() as any
  , new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any, new RepoDouble<any>() as any,);
  return { svc, experiments, subjects, events, trends, batches };
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

const EXP = {
  experimentId: 'exp-1',
  consentGranted: true,
  variants: [
    { id: 'control', splitPercent: 50 },
    { id: 'treat', splitPercent: 50 },
  ],
  minSamplesPerVariant: 2,
};

/** Assign n probe subjects and report where each deterministic bucket landed. */
async function assignMany(svc: any, experimentId: string, n: number) {
  const out: { subjectUserId: string; variantId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const subjectUserId = 'su-' + i;
    const a = await svc.assignExperimentVariant(USER, {
      experimentId, subjectUserId, consentGranted: true,
    });
    out.push({ subjectUserId, variantId: a.variantId });
  }
  return out;
}

describe('ai-training product experiment functional lifecycle (FORGE AI-029..032)', () => {
  it('defines a consent-gated experiment once and refuses duplicates and bad splits by name', async () => {
    const { svc, experiments } = makeService();
    const e = await svc.defineExperiment(USER, EXP as any);
    expect(e.experimentId).toBe('exp-1');
    expect(e.minSamplesPerVariant).toBe(2);
    expect(e.active).toBe(true);
    await expect(svc.defineExperiment(USER, EXP as any)).rejects.toThrow('experiment-duplicate:exp-1');
    await expect(
      svc.defineExperiment(USER, { ...EXP, consentGranted: false } as any),
    ).rejects.toThrow('experiment-no-consent');
    await expect(
      svc.defineExperiment(USER, { ...EXP, variants: [{ id: 'a', splitPercent: 40 }, { id: 'b', splitPercent: 59 }] } as any),
    ).rejects.toThrow('experiment-invalid-split-total:99!=100');
    const rows = await experiments.find({ where: { userId: USER } } as any);
    expect(rows).toHaveLength(1);
    await expect(svc.getExperiment(OTHER, 'exp-1')).rejects.toThrow('experiment-not-found:exp-1');
  });

  it('assigns subjects deterministically and idempotently — a double-tap never moves a subject', async () => {
    const { svc, subjects } = makeService();
    await svc.defineExperiment(USER, EXP as any);
    const a1 = await svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
    const a2 = await svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
    expect(a1.variantId).toBe(a2.variantId);
    expect(a1.bucket).toBe(a2.bucket);
    const rows = await subjects.find({ where: { userId: USER, experimentId: 'exp-1' } } as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].success).toBeNull();
    await expect(
      svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: false } as any),
    ).rejects.toThrow('assignment-consent-declined');
    await expect(
      svc.assignExperimentVariant(USER, { experimentId: 'ghost', subjectUserId: 'su-1', consentGranted: true } as any),
    ).rejects.toThrow('experiment-not-found:ghost');
  });

  it('records exactly-one outcomes: double-taps refused by name, unassigned subjects refused by name', async () => {
    const { svc } = makeService();
    await svc.defineExperiment(USER, EXP as any);
    await svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
    const o = await svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', success: true } as any);
    expect(o).toMatchObject({ subjectUserId: 'su-1', success: true });
    await expect(
      svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', success: false } as any),
    ).rejects.toThrow('outcome-duplicate:su-1');
    await expect(
      svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-404', success: true } as any),
    ).rejects.toThrow('outcome-not-assigned:su-404');
  });

  it('tallies honestly: a winner past the z threshold, insufficient below the samples floor', async () => {
    const { svc } = makeService();
    await svc.defineExperiment(USER, EXP as any);
    const subs = await assignMany(svc, 'exp-1', 100);
    const control = subs.filter((s) => s.variantId === 'control');
    const treat = subs.filter((s) => s.variantId === 'treat');
    expect(control.length).toBeGreaterThanOrEqual(2);
    expect(treat.length).toBeGreaterThanOrEqual(2);
    for (const s of control.slice(0, 2)) {
      await svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: s.subjectUserId, success: true } as any);
    }
    for (const s of treat.slice(0, 2)) {
      await svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: s.subjectUserId, success: false } as any);
    }
    const t = await svc.tallyExperiment(USER, { experimentId: 'exp-1' } as any);
    expect(t.verdict).toBe('variant-wins');
    expect(t.winner).toBe('control');
    expect(t.zScore).toBe(2);
    expect(t.lift).toBe(1);
    // the floor: one more subject converts nothing — treat stays at 2, but a
    // fresh experiment with a higher floor refuses to guess
    await svc.defineExperiment(USER, { ...EXP, experimentId: 'exp-floor', minSamplesPerVariant: 5 } as any);
    await svc.assignExperimentVariant(USER, { experimentId: 'exp-floor', subjectUserId: 'su-1', consentGranted: true } as any);
    await svc.recordExperimentOutcome(USER, { experimentId: 'exp-floor', subjectUserId: 'su-1', success: true } as any);
    const insuf = await svc.tallyExperiment(USER, { experimentId: 'exp-floor' } as any);
    expect(insuf.verdict).toBe('insufficient-samples');
    expect(insuf.winner).toBeNull();
  });

  it('builds agent scorecards from the raw event log — rates rounded, floors named', async () => {
    const { svc } = makeService();
    await svc.recordAgentEvent(USER, { agentId: 'coder', outcome: 'success' } as any);
    await svc.recordAgentEvent(USER, { agentId: 'coder', outcome: 'failure', reverted: true } as any);
    await svc.recordAgentEvent(USER, { agentId: 'coder', outcome: 'success', approved: true } as any);
    await svc.recordAgentEvent(USER, { agentId: 'rookie', outcome: 'failure' } as any);
    const sc = await svc.buildAgentScorecards(USER, { minEventsPerAgent: 2 } as any);
    const coder = sc.agents.find((a) => a.agentId === 'coder');
    expect(coder).toMatchObject({
      total: 3, successes: 2, reverts: 1, approvalDecisions: 1, approvals: 1,
      successRate: Math.round((2 / 3) * 1e6) / 1e6,
      revertRate: Math.round((1 / 3) * 1e6) / 1e6,
      approvalRate: 1,
    });
    expect(sc.insufficient).toEqual(['rookie']);
    // zero-trust: another user sees none of my agents
    const theirs = await svc.buildAgentScorecards(OTHER, { minEventsPerAgent: 2 } as any);
    expect(theirs.agents).toHaveLength(0);
  });

  it('keeps append-only trend history: idempotent double-taps, conflicting scores refused by name', async () => {
    const { svc } = makeService();
    await svc.recordTrendSample(USER, { metricId: 'm1', bucket: '2026-01-01', score: 0.9 } as any);
    const again = await svc.recordTrendSample(USER, { metricId: 'm1', bucket: '2026-01-01', score: 0.9 } as any);
    expect(again.bucket).toBe('2026-01-01');
    await expect(
      svc.recordTrendSample(USER, { metricId: 'm1', bucket: '2026-01-01', score: 0.8 } as any),
    ).rejects.toThrow('trend-conflicting-score:2026-01-01');
    await svc.recordTrendSample(USER, { metricId: 'm1', bucket: '2026-01-02', score: 0.7 } as any);
    const t = await svc.buildEvalTrend(USER, { metricId: 'm1', degradeThreshold: 0.1 } as any);
    expect(t.points).toHaveLength(2);
    expect(t.points[0].score).toBe(0.9);
    expect(t.points[1].delta).toBe(-0.2);
    expect(t.points[1].flag).toBe('degrading');
    expect(t.degradedBuckets).toEqual(['2026-01-02']);
  });

  it('mines failures into a capped, deduped, weight-ranked batch and refuses repeats by name', async () => {
    const { svc, batches } = makeService();
    const m = await svc.mineFailureCases(USER, {
      batchId: 'b1',
      maxMined: 5,
      cases: [
        { id: 'c1', content: 'fail text one', passed: false, weight: 1 },
        { id: 'c2', content: 'fail text two', passed: false, weight: 3 },
        { id: 'c3', content: 'a passing case', passed: true },
        { id: 'c4', content: 'fail text one', passed: false, weight: 2 },
      ],
    } as any);
    expect(m.batchId).toBe('b1');
    expect(m.cases.map((c: any) => c.id)).toEqual(['c2', 'c1']);
    expect(m.count).toBe(2);
    expect(m.duplicatesDropped).toBe(1);
    const rows = await batches.find({ where: { userId: USER } } as any);
    expect(rows).toHaveLength(1);
    await expect(
      svc.mineFailureCases(USER, { batchId: 'b1', maxMined: 5, cases: m.cases } as any),
    ).rejects.toThrow('mining-batch-duplicate:b1');
    await expect(
      svc.mineFailureCases(USER, {
        batchId: 'b2', maxMined: 1,
        cases: [
          { id: 'x1', content: 'f1', passed: false },
          { id: 'x2', content: 'f2', passed: false },
        ],
      } as any),
    ).rejects.toThrow('mining-cap-exceeded:2>1');
    await expect(
      svc.mineFailureCases(USER, { batchId: 'b3', maxMined: 5, cases: [{ id: 'p1', content: 'ok', passed: true }] } as any),
    ).rejects.toThrow('mining-no-failures');
  });
});

describe('ai-training product experiment adversarial scenarios (double-taps, races, zero-trust)', () => {
  it('S1 double-tap define experiment: exactly one lands, the loser refused by name in every ordering', async () => {
    for (const order of orderings([0, 1])) {
      expect(order).toHaveLength(2);
      const { svc, experiments } = makeService();
      const r = await race([
        () => svc.defineExperiment(USER, EXP as any),
        () => svc.defineExperiment(USER, EXP as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('experiment-duplicate:exp-1');
      const rows = await experiments.find({ where: { userId: USER } } as any);
      expect(rows).toHaveLength(1);
    }
  });

  it('S2 outcome-before-assign race: an outcome never lands on an unassigned subject, in every ordering', async () => {
    for (const order of orderings(['assign', 'outcome'])) {
      const { svc, subjects } = makeService();
      await svc.defineExperiment(USER, EXP as any);
      const ops: Record<string, () => Promise<any>> = {
        assign: () => svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any),
        outcome: () => svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', success: true } as any),
      };
      const r = await race(order.map((k) => ops[k]));
      const rows = await subjects.find({ where: { userId: USER, experimentId: 'exp-1' } } as any);
      expect(rows).toHaveLength(1);
      if (order[0] === 'assign') {
        expect(r.ok).toBe(2);
        expect(rows[0].success).toBe(true);
      } else {
        expect(r.ok).toBe(1);
        expect(r.refusals[0]).toContain('outcome-not-assigned:su-1');
        expect(rows[0].success).toBeNull();
      }
    }
  });

  it('S3 concurrent assigns of the same subject: both calls agree, exactly one row, the arm never drifts', async () => {
    for (const order of orderings([0, 1])) {
      expect(order).toHaveLength(2);
      const { svc, subjects } = makeService();
      await svc.defineExperiment(USER, EXP as any);
      const r = await race([
        () => svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any),
        () => svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any),
      ]);
      expect(r.ok).toBe(2);
      const rows = await subjects.find({ where: { userId: USER, experimentId: 'exp-1' } } as any);
      expect(rows).toHaveLength(1);
      const again = await svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
      expect(again.variantId).toBe(rows[0].variantId);
    }
  });

  it('S4 double-tap outcome: exactly one lands, the loser refused by name, the tally never double-counts', async () => {
    for (const order of orderings([0, 1])) {
      expect(order).toHaveLength(2);
      const { svc } = makeService();
      await svc.defineExperiment(USER, { ...EXP, minSamplesPerVariant: 1 } as any);
      await svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
      const r = await race([
        () => svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', success: true } as any),
        () => svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', success: false } as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('outcome-duplicate:su-1');
      const t = await svc.tallyExperiment(USER, { experimentId: 'exp-1' } as any);
      const counted = t.variants.reduce((n: number, v: any) => n + v.total, 0);
      expect(counted).toBe(1);
    }
  });

  it('S5 outcome-vs-tally race: the tally only ever counts outcomes that landed, in every ordering', async () => {
    for (const order of orderings(['outcome', 'tally'])) {
      const { svc } = makeService();
      await svc.defineExperiment(USER, EXP as any);
      const subs = await assignMany(svc, 'exp-1', 100);
      const control = subs.filter((s) => s.variantId === 'control').slice(0, 2);
      const treat = subs.filter((s) => s.variantId === 'treat').slice(0, 2);
      for (const s of control) {
        await svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: s.subjectUserId, success: true } as any);
      }
      await svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: treat[0].subjectUserId, success: false } as any);
      const ops: Record<string, () => Promise<any>> = {
        outcome: () => svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: treat[1].subjectUserId, success: false } as any),
        tally: () => svc.tallyExperiment(USER, { experimentId: 'exp-1' } as any),
      };
      const r = await race(order.map((k) => ops[k]));
      expect(r.ok).toBe(2);
      if (order[0] === 'tally') {
        // the racing tally saw treat at 1/2 — below the floor, it refused to guess
        expect(r.refusals).toHaveLength(0);
      }
      // after the race settles, the final tally is deterministic and correct
      const t = await svc.tallyExperiment(USER, { experimentId: 'exp-1' } as any);
      expect(t.verdict).toBe('variant-wins');
      expect(t.winner).toBe('control');
      expect(t.zScore).toBe(2);
      const counted = t.variants.reduce((n: number, v: any) => n + v.total, 0);
      expect(counted).toBe(4);
    }
  });

  it('S6 cross-user race: another user running the same experiment id changes nothing for me (zero-trust under races)', async () => {
    const { svc } = makeService();
    const r = await race([
      () => svc.defineExperiment(USER, EXP as any),
      () => svc.defineExperiment(OTHER, EXP as any),
    ]);
    expect(r.ok).toBe(2);
    await svc.assignExperimentVariant(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
    await svc.assignExperimentVariant(OTHER, { experimentId: 'exp-1', subjectUserId: 'su-1', consentGranted: true } as any);
    await svc.recordExperimentOutcome(USER, { experimentId: 'exp-1', subjectUserId: 'su-1', success: true } as any);
    const mine = await svc.tallyExperiment(USER, { experimentId: 'exp-1' } as any);
    const counted = mine.variants.reduce((n: number, v: any) => n + v.total, 0);
    expect(counted).toBe(1);
    const theirs = await svc.tallyExperiment(OTHER, { experimentId: 'exp-1' } as any);
    const theirCounted = theirs.variants.reduce((n: number, v: any) => n + v.total, 0);
    expect(theirCounted).toBe(0);
    expect(theirs.verdict).toBe('insufficient-samples');
  });

  it('S7 mining double-tap: exactly one batch lands, the loser refused by name in every ordering', async () => {
    for (const order of orderings([0, 1])) {
      expect(order).toHaveLength(2);
      const { svc, batches } = makeService();
      const payload = {
        batchId: 'b-race',
        maxMined: 5,
        cases: [{ id: 'c1', content: 'fail text one', passed: false }],
      };
      const r = await race([
        () => svc.mineFailureCases(USER, payload as any),
        () => svc.mineFailureCases(USER, payload as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('mining-batch-duplicate:b-race');
      const rows = await batches.find({ where: { userId: USER } } as any);
      expect(rows).toHaveLength(1);
    }
  });
});
