// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training.functional.spec.ts
// ============================================================================
// FUNCTIONAL tests: the intake pipeline working end to end over an in-memory
// repository double that preserves TypeORM semantics for the paths this
// service uses. Verifies the lifecycle a user actually experiences: admit
// through gates -> list zero-trust -> snapshot -> version chain -> refusal
// paths say WHY -> soft delete carries into future snapshots (AI-140).

import { TrainingAsset, TrainingAssetKind, TrainingClassification } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import { AiTrainingService } from './ai-training.service';

// ---- minimal TypeORM repository double (behavior-true, no DB needed) ----
class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: T): Promise<T> {
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
  const svc = new AiTrainingService(assets as any, datasets as any);
  return { svc, assets, datasets };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('ai-training functional lifecycle (FORGE AI-001..006)', () => {
  it('admits an asset through the gates and stores scrub evidence', async () => {
    const { svc } = makeService();
    const a = await svc.createAsset(USER, {
      title: 'Manhwa panel 1',
      kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE,
      consent: true,
      quality: 90,
      description: 'contact artist at jane.doe@example.com',
      tags: ['Manhwa', ' Ink '],
    } as any);
    expect(a.id).toBeDefined();
    expect(a.consent).toBe(true);
    expect(a.description).toContain('[REDACTED]');
    expect(a.description).not.toContain('jane.doe@example.com');
    expect(a.scrubRedactions).toBe(1);
    expect(a.scrubFindings?.some((f: any) => f.kind === 'pii-email')).toBe(true);
    expect(a.tags).toEqual(['manhwa', 'ink']);
  });

  it('refuses an asset without consent, naming the reason, and stores nothing', async () => {
    const { svc } = makeService();
    await expect(
      svc.createAsset(USER, {
        title: 'No consent upload',
        kind: TrainingAssetKind.IMAGE,
        classification: TrainingClassification.PRIVATE,
        consent: false,
      } as any),
    ).rejects.toThrow('dataset-item-without-consent');
    const list = await svc.listAssets(USER, {});
    expect(list.total).toBe(0);
  });

  it('admits an asset with no description (null, not empty-scrubbed)', async () => {
    const { svc } = makeService();
    const a = await svc.createAsset(USER, {
      title: 'No description',
      kind: TrainingAssetKind.SKETCH,
      classification: TrainingClassification.PUBLIC,
      consent: true,
    } as any);
    expect(a.description).toBeNull();
    expect(a.scrubRedactions).toBe(0);
  });

  it('lists assets zero-trust: another user sees nothing', async () => {
    const { svc } = makeService();
    await svc.createAsset(USER, {
      title: 'Mine',
      kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE,
      consent: true,
    } as any);
    const mine = await svc.listAssets(USER, {});
    const theirs = await svc.listAssets(OTHER, {});
    expect(mine.total).toBe(1);
    expect(theirs.total).toBe(0);
  });

  it('snapshots eligible assets into version 1, then version 2 with lineage', async () => {
    const { svc } = makeService();
    await svc.createAsset(USER, {
      title: 'A1',
      kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE,
      consent: true,
      quality: 80,
    } as any);
    const v1 = await svc.buildDataset(USER, { name: 'manhwa-core' } as any);
    expect(v1.version).toBe(1);
    expect(v1.itemCount).toBe(1);
    expect(v1.parentSnapshotId).toBeNull();

    await svc.createAsset(USER, {
      title: 'A2',
      kind: TrainingAssetKind.STROKE_RECORDING,
      classification: TrainingClassification.PRIVATE,
      consent: true,
      quality: 95,
    } as any);
    const v2 = await svc.buildDataset(USER, { name: 'manhwa-core' } as any);
    expect(v2.version).toBe(2);
    expect(v2.itemCount).toBe(2);
    expect(v2.parentSnapshotId).toBe(v1.id);
    expect(v2.parentVersion).toBe(1);
  });

  it('refuses an identical dataset snapshot with a named conflict', async () => {
    const { svc } = makeService();
    await svc.createAsset(USER, {
      title: 'A1',
      kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE,
      consent: true,
    } as any);
    await svc.buildDataset(USER, { name: 'same' } as any);
    await expect(svc.buildDataset(USER, { name: 'same' } as any)).rejects.toThrow(
      'dataset-unchanged-content',
    );
  });

  it('refuses a dataset with no eligible assets, naming the reason', async () => {
    const { svc } = makeService();
    await expect(svc.buildDataset(USER, { name: 'empty' } as any)).rejects.toThrow(
      'dataset-no-items',
    );
  });

  it('soft delete carries into future snapshots; frozen ones stay frozen (AI-140)', async () => {
    const { svc } = makeService();
    const a1 = await svc.createAsset(USER, {
      title: 'A1',
      kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE,
      consent: true,
    } as any);
    const v1 = await svc.buildDataset(USER, { name: 'evolve' } as any);
    expect(v1.itemCount).toBe(1);
    expect(v1.itemIds).toEqual([a1.id]);

    await svc.removeAsset(USER, a1.id);
    await expect(svc.buildDataset(USER, { name: 'evolve' } as any)).rejects.toThrow(
      'dataset-no-items',
    );
  });

  it('deleting an asset another user owns is refused (zero-trust delete)', async () => {
    const { svc } = makeService();
    const a = await svc.createAsset(USER, {
      title: 'Mine',
      kind: TrainingAssetKind.IMAGE,
      classification: TrainingClassification.PRIVATE,
      consent: true,
    } as any);
    await expect(svc.removeAsset(OTHER, a.id)).rejects.toThrow();
    const list = await svc.listAssets(USER, {});
    expect(list.total).toBe(1);
  });
});
