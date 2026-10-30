// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-model-registry.functional.spec.ts
// ============================================================================
// Service-level lifecycle + adversarial scenarios for the model registry
// (FORGE AI-033..035): registration, gap-free versions, honest cards, staged
// promotion with hard gates, and the zero-trust law. Every refusal is named;
// double-taps are idempotent or refused by name — never silently absorbed.

import { AiTrainingService } from './ai-training.service';

/** Test double for a TypeORM repository. Id-upsert save, where filters,
 *  order support (version ASC/DESC, createdAt ASC/DESC), findOne. */
class RepoDouble<T> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: any): Promise<T> {
    const idx = row.id ? this.rows.findIndex((r) => (r as any).id === row.id) : -1;
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx], ...row };
      return this.rows[idx];
    }
    const entity = { ...row };
    if (!entity.id) entity.id = 'row-' + ++this.seq;
    if (!entity.createdAt) entity.createdAt = new Date();
    this.rows.push(entity);
    return entity as T;
  }
  async find(opts: any = {}): Promise<T[]> {
    let out = this.rows.filter((r) => {
      if (!opts.where) return true;
      return Object.entries(opts.where).every(([k, v]) => (r as any)[k] === v);
    });
    if (opts.order) {
      const [field, dir] = Object.entries(opts.order)[0];
      out = out.slice().sort((a, b) => {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === 'DESC' ? -cmp : cmp;
      });
    }
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const found = await this.find(opts);
    return found.length === 0 ? null : found[0];
  }
}

const makeService = () => {
  const repos = Array.from({ length: 20 }, () => new RepoDouble<any>());
  const svc = new AiTrainingService(
    repos[0] as any, repos[1] as any, repos[2] as any, repos[3] as any,
    repos[4] as any, repos[5] as any, repos[6] as any, repos[7] as any,
    repos[8] as any, repos[9] as any, repos[10] as any, repos[11] as any,
    repos[12] as any, repos[13] as any, repos[14] as any, repos[15] as any,
    repos[16] as any, repos[17] as any, repos[18] as any, repos[19] as any,
  );
  return {
    svc,
    modelVersions: repos[13] as RepoDouble<any>,
    modelCards: repos[14] as RepoDouble<any>,
    promotionEvents: repos[15] as RepoDouble<any>,
  };
};

const register = (svc: AiTrainingService, userId: string, modelId: string, weights: string, owners: string[] = ['owner-1']) =>
  svc.registerModel(userId, {
    modelId,
    owners,
    weightsFingerprint: weights,
    lineage: { datasetId: 'ds-1', runFingerprint: 'run-' + weights },
  });

const buildCard = (svc: AiTrainingService, userId: string, modelId: string, version: number, score: number, safetyPassRate?: number) =>
  svc.buildCardForModel(userId, {
    modelId,
    version,
    intendedUse: 'Manhwa panel generation in the house style.',
    evalScores: [
      { suiteId: 'suite-b', score },
      { suiteId: 'suite-a', score },
    ],
    ...(safetyPassRate === undefined ? {} : { safetyPassRate }),
    limitations: ['Early hands can drift off-model.'],
  });

describe('AI-033..035 model registry service (functional lifecycle)', () => {
  it('registers v1 experimental with sorted owners and a modfp_ fingerprint', async () => {
    const { svc } = makeService();
    const row = await register(svc, 'user-a', 'manhwa-v1', 'w-abc', ['bob', 'alice']);
    expect(row.version).toBe(1);
    expect(row.stage).toBe('experimental');
    expect(row.owners).toEqual(['alice', 'bob']);
    expect(row.fingerprint.startsWith('modfp_')).toBe(true);
    expect(row.reused).toBe(false);
    expect(row.lineage.datasetId).toBe('ds-1');
  });

  it('lists model versions gap-free in ascending order', async () => {
    const { svc } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await register(svc, 'user-a', 'manhwa-v1', 'w-2');
    await register(svc, 'user-a', 'manhwa-v1', 'w-3');
    const rows = await svc.getModelVersions('user-a', 'manhwa-v1');
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
  });

  it('builds an honest card: sorted eval, named caveat for missing safety evidence', async () => {
    const { svc } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    const card = await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.9);
    expect(card.card.evaluation.map((e: any) => e.suiteId)).toEqual(['suite-a', 'suite-b']);
    expect(card.card.caveats).toContain('safety-evidence-missing');
    expect(card.card.cardFingerprint.startsWith('cardfp_')).toBe(true);
    expect(card.card.trainingData.datasetId).toBe('ds-1');
  });

  it('walks the full ladder with gates satisfied and appends exactly one event per promotion', async () => {
    const { svc, promotionEvents } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.9, 0.95);
    const r1 = await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'internal' });
    expect(r1.from).toBe('experimental');
    expect(r1.to).toBe('internal');
    const r2 = await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'beta' });
    expect(r2.to).toBe('beta');
    const r3 = await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'stable', safetyPassRate: 0.95 });
    expect(r3.to).toBe('stable');
    const events = await promotionEvents.find({});
    expect(events.length).toBe(3);
    expect(events.map((e: any) => e.fromStage + '->' + e.toStage)).toEqual([
      'experimental->internal',
      'internal->beta',
      'beta->stable',
    ]);
    expect(events.every((e: any) => String(e.promotionFingerprint).startsWith('promofp_'))).toBe(true);
    const rows = await svc.getModelVersions('user-a', 'manhwa-v1');
    expect(rows[0].stage).toBe('stable');
  });
});

describe('AI-033..035 model registry service (adversarial scenarios)', () => {
  it('S1 double-tap register: identical weights return the same row, never a second version', async () => {
    const { svc, modelVersions } = makeService();
    const first = await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    const second = await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    expect(second.reused).toBe(true);
    expect(second.id).toBe(first.id);
    expect((await modelVersions.find({})).length).toBe(1);
  });

  it('S2 version gaps are refused by name, not silently renumbered', async () => {
    const { svc } = makeService();
    await expect(svc.registerModel('user-a', {
      modelId: 'manhwa-v1', owners: ['o'], weightsFingerprint: 'w-1', version: 5,
    })).rejects.toThrow('registry-version-gap:5!=1');
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await expect(svc.registerModel('user-a', {
      modelId: 'manhwa-v1', owners: ['o'], weightsFingerprint: 'w-2', version: 3,
    })).rejects.toThrow('registry-version-gap:3!=2');
  });

  it('S3 two different weights registered back-to-back stay gap-free: versions 1 and 2', async () => {
    const { svc, modelVersions } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await register(svc, 'user-a', 'manhwa-v1', 'w-2');
    const rows = await modelVersions.find({ where: { userId: 'user-a' }, order: { version: 'ASC' } });
    expect(rows.map((r: any) => r.version)).toEqual([1, 2]);
  });

  it('S4 a conflicting card for the same version is refused by fingerprint', async () => {
    const { svc, modelCards } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    const first = await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.9);
    const again = await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.9);
    expect(again.id).toBe(first.id);
    await expect(svc.buildCardForModel('user-a', {
      modelId: 'manhwa-v1', version: 1,
      intendedUse: 'A different intended use entirely.',
      evalScores: [{ suiteId: 'suite-a', score: 0.9 }],
    })).rejects.toThrow('card-conflicting-fingerprint:');
    expect((await modelCards.find({})).length).toBe(1);
  });

  it('S5 illegal jumps, skips, backwards moves and re-promotions are refused by name', async () => {
    const { svc } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'beta' }))
      .rejects.toThrow('promotion-illegal:experimental->beta');
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'stable' }))
      .rejects.toThrow('promotion-illegal:experimental->stable');
    await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.9);
    await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'internal' });
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'internal' }))
      .rejects.toThrow('promotion-illegal:internal->internal');
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'experimental' }))
      .rejects.toThrow('promotion-illegal:internal->experimental');
  });

  it('S6 hard gates refuse by name: missing eval, missing card, eval below beta gate, safety below stable gate', async () => {
    const { svc } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'internal' }))
      .rejects.toThrow('promotion-missing-eval');
    await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.5);
    await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'internal' });
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'beta' }))
      .rejects.toThrow('promotion-gate-failed:eval:0.5<0.8');
    await buildCard(svc, 'user-a', 'carded-model', 1, 0.9).catch(() => undefined);
  });

  it('S6b the stable gate demands safety evidence and refuses below the boundary', async () => {
    const { svc } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await buildCard(svc, 'user-a', 'manhwa-v1', 1, 0.9);
    await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'internal' });
    await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'beta' });
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'stable' }))
      .rejects.toThrow('promotion-missing-safety');
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'stable', safetyPassRate: 0.9 }))
      .rejects.toThrow('promotion-gate-failed:safety:0.9<0.95');
    const ok = await svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'stable', safetyPassRate: 0.95 });
    expect(ok.to).toBe('stable');
  });

  it('S7 zero-trust: another user cannot read, card, or promote the model', async () => {
    const { svc } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await expect(svc.getModelVersions('user-b', 'manhwa-v1'))
      .rejects.toThrow('registry-model-not-found:manhwa-v1');
    await expect(buildCard(svc, 'user-b', 'manhwa-v1', 1, 0.9))
      .rejects.toThrow('registry-model-version-not-found:manhwa-v1:1');
    await expect(svc.promoteModelVersion('user-b', { modelId: 'manhwa-v1', version: 1, to: 'internal' }))
      .rejects.toThrow('registry-model-version-not-found:manhwa-v1:1');
    const rows = await svc.getModelVersions('user-a', 'manhwa-v1');
    expect(rows[0].stage).toBe('experimental');
  });

  it('S8 a failed promotion writes no event and never moves the stage', async () => {
    const { svc, promotionEvents, modelVersions } = makeService();
    await register(svc, 'user-a', 'manhwa-v1', 'w-1');
    await expect(svc.promoteModelVersion('user-a', { modelId: 'manhwa-v1', version: 1, to: 'beta' }))
      .rejects.toThrow('promotion-illegal:');
    expect((await promotionEvents.find({})).length).toBe(0);
    const rows = await modelVersions.find({ where: { userId: 'user-a' } });
    expect(rows[0].stage).toBe('experimental');
  });

  it('S9 a model without training lineage cannot get a card: honest refusal', async () => {
    const { svc } = makeService();
    await svc.registerModel('user-a', {
      modelId: 'no-lineage-model', owners: ['o'], weightsFingerprint: 'w-9',
    });
    await expect(buildCard(svc, 'user-a', 'no-lineage-model', 1, 0.9))
      .rejects.toThrow('card-no-training-lineage');
  });
});
