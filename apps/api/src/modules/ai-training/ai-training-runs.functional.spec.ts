// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-runs.functional.spec.ts
// ============================================================================
// FUNCTIONAL tests for training runs (FORGE AI-013/014/017/018/019/020): the
// run lifecycle a user actually experiences over behavior-true repository
// doubles — plan a run against a frozen snapshot, walk the state machine,
// checkpoint and resume, hit the budget cap, record metrics, compare two
// runs on evidence, and never see another user's run.

import { TrainingAsset, TrainingAssetKind, TrainingClassification } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import { TrainingRun } from './entities/training-run.entity';
import { AiTrainingService } from './ai-training.service';

// ---- minimal TypeORM repository double (behavior-true, no DB needed) ----
class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: T): Promise<T> {
    // TypeORM fills @CreateDateColumn/@UpdateDateColumn on insert; the double
    // must be behavior-true to those columns or snapshot lineage breaks.
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
    let out = this.rows.filter((r) => !(r as any).deletedAt);
    const w = opts.where ?? {};
    for (const [k, v] of Object.entries(w)) {
      if (k === 'id' && Array.isArray(v)) {
        out = out.filter((r) => v.includes(r.id));
      } else {
        out = out.filter((r) => (r as any)[k] === v);
      }
    }
    if (opts.withDeleted) {
      out = this.rows.filter((r) => (Array.isArray(w.id) ? w.id.includes(r.id) : true));
    }
    if (opts.order?.createdAt === 'ASC') {
      out = out.slice().sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    if (opts.order?.createdAt === 'DESC') {
      out = out.slice().sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
  async findAndCount(opts: any = {}): Promise<[T[], number]> {
    const all = await this.find(opts);
    return [all, all.length];
  }
  async softDelete(id: string): Promise<void> {
    const r: any = this.rows.find((x) => x.id === id);
    if (r) r.deletedAt = new Date();
  }
}

function makeService() {
  const assets = new RepoDouble<TrainingAsset>();
  const datasets = new RepoDouble<TrainingDataset>();
  const runs = new RepoDouble<TrainingRun>();
  const svc = new AiTrainingService(assets as any, datasets as any, runs as any);
  return { svc, assets, datasets, runs };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function seedSnapshot(svc: any): Promise<TrainingDataset> {
  await svc.createAsset(USER, {
    title: 'Panel A',
    kind: TrainingAssetKind.IMAGE,
    classification: TrainingClassification.PRIVATE,
    consent: true,
    quality: 90,
  } as any);
  return svc.buildDataset(USER, { name: 'core' } as any);
}

describe('ai-training runs functional lifecycle (FORGE AI-013..020)', () => {
  it('plans a run against a frozen snapshot with engine truths', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const run = await svc.createRun(USER, {
      datasetId: ds.id,
      budget: 10,
      costPerStep: 1,
      seed: 42,
      codeVersion: 'git-abc123',
      environment: 'colab-t4-lora',
    } as any);
    expect(run.state).toBe('planned');
    // 1 item, default batch 32, default 3 epochs => 1 step per epoch => 3 steps.
    expect(run.plan.steps).toBe(3);
    expect(run.plan.estimatedCost).toBe(3);
    expect(run.runFingerprint).toMatch(/^runfp_[0-9a-f]{8}$/);
    expect(run.spent).toBe(0);
  });

  it('refuses a run whose plan exceeds the budget, by name', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    await expect(
      svc.createRun(USER, {
        datasetId: ds.id,
        budget: 1,
        costPerStep: 1,
        seed: 42,
        codeVersion: 'v1',
        environment: 'env',
      } as any),
    ).rejects.toThrow('plan-budget-refused');
  });

  it('refuses a run against a missing snapshot (zero-trust)', async () => {
    const { svc } = makeService();
    await expect(
      svc.createRun(OTHER, {
        datasetId: '00000000-0000-4000-8000-000000000000',
        budget: 10,
        costPerStep: 1,
        seed: 1,
        codeVersion: 'v1',
        environment: 'env',
      } as any),
    ).rejects.toThrow();
  });

  it('walks the legal lifecycle and refuses teleports by name', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const run = await svc.createRun(USER, { datasetId: ds.id, budget: 10, costPerStep: 1, seed: 7, codeVersion: 'v1', environment: 'env' } as any);
    await expect(
      svc.transitionRun(USER, run.id, { to: 'succeeded' } as any),
    ).rejects.toThrow('run-illegal-transition:planned->succeeded');
    const started = await svc.transitionRun(USER, run.id, { to: 'running' } as any);
    expect(started.state).toBe('running');
    const paused = await svc.transitionRun(USER, run.id, { to: 'paused' } as any);
    expect(paused.state).toBe('paused');
    // no checkpoint yet: resume refused by name
    await expect(
      svc.transitionRun(USER, run.id, { to: 'running' } as any),
    ).rejects.toThrow('resume-no-checkpoint');
  });

  it('checkpoints while running and resumes from the checkpoint', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const run = await svc.createRun(USER, { datasetId: ds.id, budget: 10, costPerStep: 1, seed: 7, codeVersion: 'v1', environment: 'env' } as any);
    // checkpoints before running are refused
    await expect(svc.recordRunCheckpoint(USER, run.id, { step: 0, loss: 1 } as any)).rejects.toThrow('run-not-running:planned');
    await svc.transitionRun(USER, run.id, { to: 'running' } as any);
    const cp = await svc.recordRunCheckpoint(USER, run.id, { step: 1, loss: 0.5 } as any);
    expect(cp.checkpoint).toMatchObject({ step: 1, sequence: 1, loss: 0.5 });
    // sequence is monotone
    const cp2 = await svc.recordRunCheckpoint(USER, run.id, { step: 2, loss: 0.3 } as any);
    expect(cp2.checkpoint).toMatchObject({ step: 2, sequence: 2 });
    // checkpoint past the plan is refused by name
    await expect(svc.recordRunCheckpoint(USER, run.id, { step: 3, loss: 0.2 } as any)).rejects.toThrow('resume-checkpoint-past-plan');
    await svc.transitionRun(USER, run.id, { to: 'paused' } as any);
    const resumed = await svc.transitionRun(USER, run.id, { to: 'running' } as any);
    expect(resumed.state).toBe('running');
  });

  it('charges cost against the cap and refuses overspend by name', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const run = await svc.createRun(USER, { datasetId: ds.id, budget: 5, costPerStep: 1, seed: 7, codeVersion: 'v1', environment: 'env' } as any);
    const r1 = await svc.recordRunCost(USER, run.id, { step: 0, units: 2 } as any);
    expect(Number(r1.spent)).toBe(2);
    const r2 = await svc.recordRunCost(USER, run.id, { step: 1, units: 3 } as any);
    expect(Number(r2.spent)).toBe(5);
    expect(r2.costEntries).toHaveLength(2);
    await expect(svc.recordRunCost(USER, run.id, { step: 2, units: 1 } as any)).rejects.toThrow('cost-budget-exceeded');
  });

  it('records step-ordered metrics and refuses disorder by name', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const run = await svc.createRun(USER, { datasetId: ds.id, budget: 10, costPerStep: 1, seed: 7, codeVersion: 'v1', environment: 'env' } as any);
    const m = await svc.recordRunMetric(USER, run.id, { step: 0, loss: 1.0, evalScore: 0.6 } as any);
    expect(m.metrics).toHaveLength(1);
    await svc.recordRunMetric(USER, run.id, { step: 1, loss: 0.5 } as any);
    await expect(svc.recordRunMetric(USER, run.id, { step: 0, loss: 0.4 } as any)).rejects.toThrow('metrics-step-disorder');
  });

  it('compares two runs on evidence and refuses metric-less ghosts', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const a = await svc.createRun(USER, { datasetId: ds.id, budget: 10, costPerStep: 1, seed: 1, codeVersion: 'v1', environment: 'env' } as any);
    const b = await svc.createRun(USER, { datasetId: ds.id, budget: 10, costPerStep: 1, seed: 2, codeVersion: 'v1', environment: 'env' } as any);
    await expect(svc.compareRuns(USER, { runAId: a.id, runBId: b.id } as any)).rejects.toThrow('compare-invalid-loss');
    await svc.recordRunMetric(USER, a.id, { step: 0, loss: 0.5, evalScore: 0.8 } as any);
    await svc.recordRunMetric(USER, b.id, { step: 0, loss: 0.3, evalScore: 0.9 } as any);
    const cmp = await svc.compareRuns(USER, { runAId: a.id, runBId: b.id } as any);
    expect(cmp.basis).toBe('eval-score');
    expect(cmp.winner).toBe(b.id);
    expect(Math.abs(cmp.margin - 0.1)).toBeLessThan(1e-9);
  });

  it('never shows another user their runs (zero-trust)', async () => {
    const { svc } = makeService();
    const ds = await seedSnapshot(svc);
    const run = await svc.createRun(USER, { datasetId: ds.id, budget: 10, costPerStep: 1, seed: 1, codeVersion: 'v1', environment: 'env' } as any);
    await expect(svc.getRun(OTHER, run.id)).rejects.toThrow();
    const mine = await svc.listRuns(USER, {});
    const theirs = await svc.listRuns(OTHER, {});
    expect(mine.total).toBe(1);
    expect(theirs.total).toBe(0);
  });
});
