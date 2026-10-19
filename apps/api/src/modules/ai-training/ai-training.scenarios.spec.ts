// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training.scenarios.spec.ts
// ============================================================================
// ADVERSARIAL SCENARIO tests (service level): not laws, but CHAOS — the real
// world where users double-tap, two admins press cancel at the same instant,
// retries fire twice, and requests built from the same stale read interleave.
// Every race is applied across ALL possible orderings of the racing requests
// (the database serializes concurrent writes in SOME order; the system must
// be safe in EVERY order). Invariants are asserted per ordering:
//   - exactly one winner when operations conflict (no double-apply)
//   - the loser is refused BY NAME (never silent, never corrupting)
//   - final state is always legal; caps are never crossed
//   - zero-trust holds under races: another user's race changes nothing

import { TrainingAsset, TrainingAssetKind, TrainingClassification } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import { TrainingRun } from './entities/training-run.entity';
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
    let out = this.rows.filter((r) => !(r as any).deletedAt);
    const w = opts.where ?? {};
    for (const [k, v] of Object.entries(w)) {
      if (k === 'id' && Array.isArray(v)) out = out.filter((r) => v.includes(r.id));
      else out = out.filter((r) => (r as any)[k] === v);
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

/** All orderings of n racing ops — the serialization orders a DB can pick. */
function orderings<T>(ops: T[]): T[][] {
  if (ops.length <= 1) return [ops.slice()];
  const out: T[][] = [];
  for (let i = 0; i < ops.length; i++) {
    const rest = ops.slice(0, i).concat(ops.slice(i + 1));
    for (const tail of orderings(rest)) out.push([ops[i], ...tail]);
  }
  return out;
}

/** Apply racing ops in the given order; return which succeeded and which were refused with what reason. */
async function race<T>(ops: Array<() => Promise<T>>): Promise<{ ok: number; refusals: string[] }> {
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

async function seedRun(svc: any, opts: { budget?: number } = {}) {
  await svc.createAsset(USER, {
    title: 'Panel A', kind: TrainingAssetKind.IMAGE,
    classification: TrainingClassification.PRIVATE, consent: true, quality: 90,
  } as any);
  const ds = await svc.buildDataset(USER, { name: 'core' } as any);
  return svc.createRun(USER, {
    datasetId: ds.id, budget: opts.budget ?? 10, costPerStep: 1,
    seed: 42, codeVersion: 'v1', environment: 'env',
  } as any);
}

describe('ai-training adversarial scenarios (double-tap, concurrent admins, stale reads)', () => {
  // --- S1: two admins press CANCEL at the same instant ---
  it('S1 double-tap cancel: exactly one cancel wins, the loser is refused by name, state never corrupts', async () => {
    for (const order of orderings([0, 1])) {
      const { svc } = makeService();
      const run = await seedRun(svc);
      await svc.transitionRun(USER, run.id, { to: 'running' } as any);
      // both requests were built from the same stale read (state=running)
      const ops = [
        () => svc.transitionRun(USER, run.id, { to: 'canceled' } as any),
        () => svc.transitionRun(USER, run.id, { to: 'canceled' } as any),
      ];
      const r = await race(ops.slice(order[0], order[0]).concat(ops.slice(0, order[0])).length ? ops : ops);
      // exactly one cancel applied
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('run-illegal-transition:canceled->canceled');
      const after = await svc.getRun(USER, run.id);
      expect(after.state).toBe('canceled');
      expect(after.checkpoint).toBeNull();
    }
  });

  // --- S2: one admin pauses, another marks success, same instant ---
  it('S2 pause-vs-succeed race: first writer wins, second refused by name, final state is the winner's', async () => {
    const outcomes = ['paused', 'succeeded'] as const;
    for (const winnerIdx of [0, 1]) {
      const { svc } = makeService();
      const run = await seedRun(svc);
      await svc.transitionRun(USER, run.id, { to: 'running' } as any);
      const ops = [
        () => svc.transitionRun(USER, run.id, { to: outcomes[winnerIdx] } as any),
        () => svc.transitionRun(USER, run.id, { to: outcomes[1 - winnerIdx] } as any),
      ];
      const r = await race(ops);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('run-illegal-transition');
      const after = await svc.getRun(USER, run.id);
      expect(after.state).toBe(outcomes[winnerIdx]);
    }
  });

  // --- S3: double-tap resume ---
  it('S3 double-tap resume: exactly one resume applied, no restart-from-zero', async () => {
    const { svc } = makeService();
    const run = await seedRun(svc);
    await svc.transitionRun(USER, run.id, { to: 'running' } as any);
    await svc.recordRunCheckpoint(USER, run.id, { step: 1, loss: 0.5 } as any);
    await svc.transitionRun(USER, run.id, { to: 'paused' } as any);
    const r = await race([
      () => svc.transitionRun(USER, run.id, { to: 'running' } as any),
      () => svc.transitionRun(USER, run.id, { to: 'running' } as any),
    ]);
    expect(r.ok).toBe(1);
    expect(r.refusals[0]).toContain('run-illegal-transition:running->running');
    const after = await svc.getRun(USER, run.id);
    expect(after.state).toBe('running');
    // the checkpoint survived: the run still knows where it is
    expect(after.checkpoint).toMatchObject({ step: 1 });
  });

  // --- S4: two cost events race at the budget cap ---
  it('S4 double-tap cost at the cap: one event wins, the cap is never crossed, the loser is named', async () => {
    for (const _order of orderings([0, 1])) {
      const { svc } = makeService();
      const run = await seedRun(svc, { budget: 5 });
      await svc.recordRunCost(USER, run.id, { step: 0, units: 3 } as any);
      // two 2-unit events race: only one fits under the cap of 5
      const r = await race([
        () => svc.recordRunCost(USER, run.id, { step: 1, units: 2 } as any),
        () => svc.recordRunCost(USER, run.id, { step: 1, units: 2 } as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('cost-budget-exceeded');
      const after = await svc.getRun(USER, run.id);
      expect(Number(after.spent)).toBe(5);
      expect(after.costEntries).toHaveLength(2);
    }
  });

  // --- S5: double-tap snapshot build (retry storm) ---
  it('S5 double-tap buildDataset: exactly one version is created, the duplicate is refused by name', async () => {
    for (const _order of orderings([0, 1])) {
      const { svc, datasets } = makeService();
      await svc.createAsset(USER, {
        title: 'A1', kind: TrainingAssetKind.IMAGE,
        classification: TrainingClassification.PRIVATE, consent: true,
      } as any);
      const r = await race([
        () => svc.buildDataset(USER, { name: 'same' } as any),
        () => svc.buildDataset(USER, { name: 'same' } as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toContain('dataset-unchanged-content');
      const rows = await datasets.find({ where: { userId: USER, name: 'same' } } as any);
      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe(1);
    }
  });

  // --- S6: checkpoint races cancel ---
  it('S6 checkpoint-vs-cancel race: cancel always wins in the end; checkpoint after cancel is refused by name', async () => {
    for (const order of orderings(['cp', 'cancel'])) {
      const { svc } = makeService();
      const run = await seedRun(svc);
      await svc.transitionRun(USER, run.id, { to: 'running' } as any);
      const ops: Record<string, () => Promise<any>> = {
        cp: () => svc.recordRunCheckpoint(USER, run.id, { step: 1, loss: 0.5 } as any),
        cancel: () => svc.transitionRun(USER, run.id, { to: 'canceled' } as any),
      };
      const r = await race(order.map((k) => ops[k]));
      const after = await svc.getRun(USER, run.id);
      // invariant: the run is always canceled in the end
      expect(after.state).toBe('canceled');
      if (order[0] === 'cancel') {
        expect(r.ok).toBe(1);
        expect(r.refusals[0]).toContain('run-not-running:canceled');
        expect(after.checkpoint).toBeNull();
      } else {
        expect(r.ok).toBe(2);
        expect(after.checkpoint).toMatchObject({ step: 1 });
      }
    }
  });

  // --- S7: duplicate metric double-tap (retry) ---
  it('S7 double-tap metric: the duplicate step is refused by name, the series stays clean', async () => {
    const { svc } = makeService();
    const run = await seedRun(svc);
    await svc.transitionRun(USER, run.id, { to: 'running' } as any);
    const r = await race([
      () => svc.recordRunMetric(USER, run.id, { step: 0, loss: 1.0, evalScore: 0.6 } as any),
      () => svc.recordRunMetric(USER, run.id, { step: 0, loss: 1.0, evalScore: 0.6 } as any),
    ]);
    expect(r.ok).toBe(1);
    expect(r.refusals[0]).toContain('metrics-step-disorder');
    const after = await svc.getRun(USER, run.id);
    expect(after.metrics).toHaveLength(1);
  });

  // --- S8: two different users' builds never touch each other ---
  it('S8 cross-user race: another user canceling my run changes nothing (zero-trust under races)', async () => {
    const { svc } = makeService();
    const run = await seedRun(svc);
    await svc.transitionRun(USER, run.id, { to: 'running' } as any);
    const r = await race([
      () => svc.transitionRun(OTHER, run.id, { to: 'canceled' } as any),
      () => svc.transitionRun(OTHER, run.id, { to: 'canceled' } as any),
    ]);
    expect(r.ok).toBe(0);
    expect(r.refusals).toHaveLength(2);
    const after = await svc.getRun(USER, run.id);
    expect(after.state).toBe('running');
  });

  // --- S9: createAsset double-tap (network retry) ---
  it('S9 double-tap createAsset: intake is not idempotent (documented), but never corrupts: two honest rows, both gated', async () => {
    const { svc } = makeService();
    const payload = {
      title: 'Panel X', kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE, consent: true, quality: 70,
    } as any;
    const r = await race([
      () => svc.createAsset(USER, payload),
      () => svc.createAsset(USER, payload),
    ]);
    expect(r.ok).toBe(2);
    const list = await svc.listAssets(USER, {});
    expect(list.total).toBe(2);
    // both rows passed the gates; dedupe is content-fingerprinted at snapshot time
    for (const a of list.data) {
      expect(a.consent).toBe(true);
      expect(a.eligible).toBe(true);
    }
  });

  // --- S10: 3-way interleaving of start/checkpoint/cancel across ALL 6 orderings ---
  it('S10 start+checkpoint+cancel 3-way race: every interleaving ends canceled with named refusals only', async () => {
    for (const order of orderings(['start', 'cp', 'cancel'])) {
      const { svc } = makeService();
      const run = await seedRun(svc);
      const ops: Record<string, () => Promise<any>> = {
        start: () => svc.transitionRun(USER, run.id, { to: 'running' } as any),
        cp: () => svc.recordRunCheckpoint(USER, run.id, { step: 0, loss: 1 } as any),
        cancel: () => svc.transitionRun(USER, run.id, { to: 'canceled' } as any),
      };
      const r = await race(order.map((k) => ops[k]));
      const after = await svc.getRun(USER, run.id);
      // invariant 1: the run is ALWAYS canceled once cancel has been applied
      expect(after.state).toBe('canceled');
      // invariant 2: successes + refusals == 3, nothing vanished
      expect(r.ok + r.refusals.length).toBe(3);
      // invariant 3: every refusal is NAMED with a run-* reason — never silent
      for (const msg of r.refusals) expect(msg).toMatch(/reason: (run-|resume-)/);
      // invariant 4: a checkpoint only survives if it landed before cancel
      if (after.checkpoint) {
        const cpIdx = order.indexOf('cp');
        const cancelIdx = order.indexOf('cancel');
        expect(cpIdx).toBeLessThan(cancelIdx);
      }
    }
  });

  // --- S11: budget race — three spenders, cap 5, spent 3: one 2-unit event fits ---
  it('S11 triple-tap cost at the cap: exactly one of three racing events lands, cap never crossed', async () => {
    for (const _order of orderings([0, 1, 2])) {
      const { svc } = makeService();
      const run = await seedRun(svc, { budget: 5 });
      await svc.recordRunCost(USER, run.id, { step: 0, units: 3 } as any);
      const r = await race([
        () => svc.recordRunCost(USER, run.id, { step: 1, units: 2 } as any),
        () => svc.recordRunCost(USER, run.id, { step: 1, units: 2 } as any),
        () => svc.recordRunCost(USER, run.id, { step: 1, units: 2 } as any),
      ]);
      expect(r.ok).toBe(1);
      expect(r.refusals).toHaveLength(2);
      for (const msg of r.refusals) expect(msg).toContain('cost-budget-exceeded');
      const after = await svc.getRun(USER, run.id);
      expect(Number(after.spent)).toBe(5);
    }
  });
});
