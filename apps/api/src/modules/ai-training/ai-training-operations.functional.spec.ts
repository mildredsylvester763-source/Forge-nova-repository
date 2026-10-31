// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-operations.functional.spec.ts
// ============================================================================
// Service-level lifecycle + adversarial scenarios for model operations
// (FORGE AI-040..044): response cache with prefix reuse, streaming
// cancel/resume, honest serving metrics, shadow deployment with a sample
// floor, and instant rollback to previously-served versions. Every refusal
// is named; a refused operation stores NOTHING; double-taps are idempotent
// by fingerprint or plan content — never silently absorbed. Zero-trust
// throughout: one user never sees another user's cache, streams, metrics,
// shadows or rollbacks.

import { AiTrainingService } from './ai-training.service';

/** Test double for a TypeORM repository. Id-upsert save, where filters,
 *  order support (createdAt ASC), findOne, remove. */
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
  async remove(row: any): Promise<T> {
    const idx = this.rows.findIndex((r) => (r as any).id === row.id);
    if (idx >= 0) this.rows.splice(idx, 1);
    return row;
  }
}

const makeService = () => {
  const repos = Array.from({ length: 38 }, () => new RepoDouble<any>());
  const svc = new AiTrainingService(
    repos[0] as any, repos[1] as any, repos[2] as any, repos[3] as any,
    repos[4] as any, repos[5] as any, repos[6] as any, repos[7] as any,
    repos[8] as any, repos[9] as any, repos[10] as any, repos[11] as any,
    repos[12] as any, repos[13] as any, repos[14] as any, repos[15] as any,
    repos[16] as any, repos[17] as any, repos[18] as any, repos[19] as any,
    repos[20] as any, repos[21] as any, repos[22] as any, repos[23] as any,
    repos[24] as any,
   repos[25] as any, repos[26] as any, repos[27] as any, repos[28] as any, repos[29] as any, repos[30] as any, repos[31] as any, repos[32] as any,
    repos[33] as any, repos[34] as any, repos[35] as any, repos[36] as any, repos[37] as any,);
  return {
    svc,
    cache: repos[20] as RepoDouble<any>,
    streams: repos[21] as RepoDouble<any>,
    samples: repos[22] as RepoDouble<any>,
    shadows: repos[23] as RepoDouble<any>,
    rollbacks: repos[24] as RepoDouble<any>,
  };
};

describe('AI-040..044 model operations service (functional lifecycle)', () => {
  it('cache admission is fingerprint-idempotent: a duplicate admit touches LRU but never duplicates rows', async () => {
    const { svc, cache } = makeService();
    const first = await svc.admitResponseCache('user-a', {
      modelId: 'm-1', prompt: 'hello', promptTokens: 10, outputTokens: 20, now: 1000,
    });
    expect(first.duplicate).toBe(false);
    expect(first.fingerprint).toBe('rc_5d6f197e');
    const again = await svc.admitResponseCache('user-a', {
      modelId: 'm-1', prompt: 'hello', promptTokens: 10, outputTokens: 20, now: 2000,
    });
    expect(again.duplicate).toBe(true);
    expect(again.evicted).toEqual([]);
    expect(again.entry.lastUsedAt).toBe(2000);
    expect(cache.rows.length).toBe(1);
  });

  it('exact hits answer free, prefix reuse discounts input processing by half', async () => {
    const { svc } = makeService();
    await svc.admitResponseCache('user-a', {
      modelId: 'm-1', prompt: 'Once upon a time', promptTokens: 8, outputTokens: 12, now: 100,
    });
    const exact = await svc.lookupResponse('user-a', { modelId: 'm-1', prompt: 'Once upon a time' });
    expect(exact).toEqual({
      modelId: 'm-1', outcome: 'exact', entryId: 'rc_089fc101', reusedTokens: 0, savedTokens: 12,
    });
    const prefix = await svc.lookupResponse('user-a', { modelId: 'm-1', prompt: 'Once upon a time there was a fox' });
    expect(prefix).toEqual({
      modelId: 'm-1', outcome: 'prefix', entryId: 'rc_089fc101', reusedTokens: 8, savedTokens: 4,
    });
    const miss = await svc.lookupResponse('user-a', { modelId: 'm-1', prompt: 'Completely different' });
    expect(miss.outcome).toBe('miss');
    expect(miss.entryId).toBeNull();
  });

  it('LRU eviction never touches pinned entries; an all-pinned full pool is refused by name', async () => {
    const { svc, cache } = makeService();
    await svc.admitResponseCache('user-a', {
      modelId: 'm-ev', prompt: 'p1', promptTokens: 1, outputTokens: 1, now: 1, pinned: true, maxEntries: 2,
    });
    const p2 = await svc.admitResponseCache('user-a', {
      modelId: 'm-ev', prompt: 'p2', promptTokens: 1, outputTokens: 1, now: 2, maxEntries: 2,
    });
    const p3 = await svc.admitResponseCache('user-a', {
      modelId: 'm-ev', prompt: 'p3', promptTokens: 1, outputTokens: 1, now: 3, maxEntries: 2,
    });
    expect(p2.duplicate).toBe(false);
    expect(p3.evicted).toEqual(['rc_3aa904d6']);
    const rows = await svc.listCacheEntries('user-a', 'm-ev');
    expect(rows.map((r: any) => r.entry.prompt)).toEqual(['p1', 'p3']);
    await svc.admitResponseCache('user-a', {
      modelId: 'm-pin', prompt: 'q0', promptTokens: 1, outputTokens: 1, now: 0, pinned: true, maxEntries: 1,
    });
    await expect(svc.admitResponseCache('user-a', {
      modelId: 'm-pin', prompt: 'q1', promptTokens: 1, outputTokens: 1, now: 1, pinned: true, maxEntries: 1,
    })).rejects.toThrow('cache-full-pinned:1');
    const pinRows = await svc.listCacheEntries('user-a', 'm-pin');
    expect(pinRows.length).toBe(1);
    expect(cache.rows.length).toBe(3);
  });

  it('an invalid admission is refused by name and stores nothing', async () => {
    const { svc, cache } = makeService();
    await expect(svc.admitResponseCache('user-a', {
      modelId: 'm-bad', prompt: 'x', promptTokens: 0, outputTokens: 1, now: 1,
    })).rejects.toThrow('cache-admit-invalid-tokens:0');
    const rows = await svc.listCacheEntries('user-a', 'm-bad');
    expect(rows.length).toBe(0);
    expect(cache.rows.length).toBe(0);
  });

  it('a stream opens idempotently, chunks contiguously, and refuses gaps by name', async () => {
    const { svc, streams } = makeService();
    const opened = await svc.openStream('user-a', { streamId: 'st-1', modelId: 'm-1' });
    expect(opened.reused).toBe(false);
    expect(opened.state.status).toBe('open');
    const reopened = await svc.openStream('user-a', { streamId: 'st-1', modelId: 'm-1' });
    expect(reopened.reused).toBe(true);
    await svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 0, content: 'Hel' });
    const grown = await svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 1, content: 'lo' });
    expect(grown.state.chunks).toEqual(['Hel', 'lo']);
    await expect(svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 5, content: 'x' }))
      .rejects.toThrow('stream-chunk-out-of-order:5>2');
    expect(streams.rows.length).toBe(1);
  });

  it('resume replays the exact suffix and refuses invented positions', async () => {
    const { svc } = makeService();
    await svc.openStream('user-a', { streamId: 'st-1', modelId: 'm-1' });
    await svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 0, content: 'Hel' });
    await svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 1, content: 'lo' });
    const resume = await svc.resumeStream('user-a', { streamId: 'st-1', clientLastIndex: 0 });
    expect(resume).toEqual({ streamId: 'st-1', resumeFromIndex: 1, replayChunks: ['lo'] });
    await expect(svc.resumeStream('user-a', { streamId: 'st-1', clientLastIndex: 9 }))
      .rejects.toThrow('resume-ahead-of-stream:9>1');
  });

  it('cancel is idempotent and terminal: no chunk, complete, resume or reopen after it', async () => {
    const { svc } = makeService();
    await svc.openStream('user-a', { streamId: 'st-1', modelId: 'm-1' });
    await svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 0, content: 'Hel' });
    const first = await svc.cancelStream('user-a', { streamId: 'st-1' });
    expect(first.state.status).toBe('cancelled');
    const again = await svc.cancelStream('user-a', { streamId: 'st-1' });
    expect(again.state.status).toBe('cancelled');
    await expect(svc.appendStreamChunk('user-a', { streamId: 'st-1', index: 1, content: 'x' }))
      .rejects.toThrow('stream-not-open:cancelled');
    await expect(svc.completeStream('user-a', { streamId: 'st-1' }))
      .rejects.toThrow('stream-complete-after-cancel');
    await expect(svc.resumeStream('user-a', { streamId: 'st-1', clientLastIndex: 0 }))
      .rejects.toThrow('stream-not-resumable:cancelled');
    await expect(svc.openStream('user-a', { streamId: 'st-1', modelId: 'm-1' }))
      .rejects.toThrow('stream-open-after-cancelled:st-1');
  });

  it('an unknown stream is refused by name and stores nothing', async () => {
    const { svc, streams } = makeService();
    await expect(svc.getStream('user-a', 'st-x')).rejects.toThrow('stream-not-found:st-x');
    await expect(svc.appendStreamChunk('user-a', { streamId: 'st-x', index: 0, content: 'x' }))
      .rejects.toThrow('stream-not-found:st-x');
    expect(streams.rows.length).toBe(0);
  });

  it('metrics aggregate honestly: nearest-rank percentiles, real error rate, no smoothing', async () => {
    const { svc } = makeService();
    await svc.recordServingMetric('user-a', { modelId: 'm-1', latencyMs: 600, tokens: 100, costUsd: 0.01 });
    await svc.recordServingMetric('user-a', { modelId: 'm-1', latencyMs: 1000, tokens: 200, costUsd: 0.05 });
    await svc.recordServingMetric('user-a', { modelId: 'm-1', latencyMs: 2000, tokens: 400, costUsd: 0.11, ok: false });
    const metrics = await svc.buildServingMetrics('user-a', { modelId: 'm-1' });
    expect(metrics).toEqual({
      modelId: 'm-1',
      sampleCount: 3,
      errorCount: 1,
      errorRate: 0.333333,
      p50LatencyMs: 600,
      p95LatencyMs: 1000,
      p99LatencyMs: 1000,
      avgTtftMs: 0,
      totalTokens: 700,
      totalCostUsd: 0.17,
      costPer1kTokens: 0.242857,
      latencyBudgetMs: 2000,
      budgetBreached: false,
    });
    const tight = await svc.buildServingMetrics('user-a', { modelId: 'm-1', latencyBudgetMs: 500 });
    expect(tight.budgetBreached).toBe(true);
  });

  it('aggregating a model with no samples is refused by name', async () => {
    const { svc, samples } = makeService();
    await expect(svc.buildServingMetrics('user-a', { modelId: 'm-none' }))
      .rejects.toThrow('metrics-no-samples');
    expect(samples.rows.length).toBe(0);
  });

  it('a shadow deployment refuses duplicates and self-shadowing by name', async () => {
    const { svc } = makeService();
    const created = await svc.createShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' });
    expect(created.status).toBe('shadowing');
    expect(created.pairs).toEqual([]);
    expect(created.result).toBeNull();
    await expect(svc.createShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' }))
      .rejects.toThrow('shadow-deployment-duplicate:champ:chall');
    await expect(svc.createShadowDeployment('user-a', { championId: 'mm', challengerId: 'mm' }))
      .rejects.toThrow('shadow-same-model:mm');
    const all = await svc.listShadowDeployments('user-a');
    expect(all.length).toBe(1);
  });

  it('under the sample floor no verdict is frozen: the refusal stores nothing', async () => {
    const { svc } = makeService();
    await svc.createShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' });
    for (let i = 0; i < 29; i++) {
      await svc.recordShadowPair('user-a', { championId: 'champ', challengerId: 'chall', agree: true });
    }
    await expect(svc.evaluateShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' }))
      .rejects.toThrow('shadow-insufficient-samples:29<30');
    const rows = await svc.listShadowDeployments('user-a', 'champ');
    const row: any = rows[0];
    expect(row.result).toBeNull();
    expect(row.status).toBe('shadowing');
  });

  it('30 of 30 agreement promotes the challenger and freezes the verdict', async () => {
    const { svc } = makeService();
    await svc.createShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' });
    for (let i = 0; i < 30; i++) {
      await svc.recordShadowPair('user-a', { championId: 'champ', challengerId: 'chall', agree: true });
    }
    const verdict = await svc.evaluateShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' });
    expect(verdict).toEqual({
      championId: 'champ',
      challengerId: 'chall',
      sampleCount: 30,
      agreementCount: 30,
      agreementRate: 1,
      threshold: 0.95,
      verdict: 'promote-shadow',
    });
    const rows = await svc.listShadowDeployments('user-a', 'champ');
    const row: any = rows[0];
    expect(row.status).toBe('promoted');
    expect(row.result?.verdict).toBe('promote-shadow');
    await expect(svc.recordShadowPair('user-a', { championId: 'champ', challengerId: 'chall', agree: true }))
      .rejects.toThrow('shadow-pair-after-promoted:champ');
  });

  it('28 of 30 agreement holds the shadow — no promotion on a near miss', async () => {
    const { svc } = makeService();
    await svc.createShadowDeployment('user-a', { championId: 'champ2', challengerId: 'chall2' });
    for (let i = 0; i < 28; i++) {
      await svc.recordShadowPair('user-a', { championId: 'champ2', challengerId: 'chall2', agree: true });
    }
    for (let i = 0; i < 2; i++) {
      await svc.recordShadowPair('user-a', { championId: 'champ2', challengerId: 'chall2', agree: false });
    }
    const verdict = await svc.evaluateShadowDeployment('user-a', { championId: 'champ2', challengerId: 'chall2' });
    expect(verdict.agreementRate).toBe(0.933333);
    expect(verdict.verdict).toBe('hold-shadow');
    const rows = await svc.listShadowDeployments('user-a', 'champ2');
    const row: any = rows[0];
    expect(row.status).toBe('shadowing');
  });

  it('rollback flips only to previously-served versions and is fingerprint-idempotent', async () => {
    const { svc, rollbacks } = makeService();
    const first = await svc.rollbackModelVersion('user-a', {
      modelId: 'm-1', currentVersion: 'v3', targetVersion: 'v2', servedVersions: ['v1', 'v2', 'v3'],
    });
    expect(first.reused).toBe(false);
    expect(first.plan).toEqual({
      modelId: 'm-1',
      fromVersion: 'v3',
      toVersion: 'v2',
      instant: true,
      fingerprint: 'rb_5e5031f5',
      servedVersionsAfter: ['v1', 'v2', 'v3'],
    });
    const again = await svc.rollbackModelVersion('user-a', {
      modelId: 'm-1', currentVersion: 'v3', targetVersion: 'v2', servedVersions: ['v1', 'v2', 'v3'],
    });
    expect(again.reused).toBe(true);
    expect(rollbacks.rows.length).toBe(1);
    const events = await svc.listRollbackEvents('user-a', 'm-1');
    expect(events.length).toBe(1);
  });

  it('rollback refusals are named and store nothing', async () => {
    const { svc, rollbacks } = makeService();
    await expect(svc.rollbackModelVersion('user-a', {
      modelId: 'm-1', currentVersion: 'v3', targetVersion: 'v9', servedVersions: ['v1', 'v2', 'v3'],
    })).rejects.toThrow('rollback-unknown-version:v9');
    await expect(svc.rollbackModelVersion('user-a', {
      modelId: 'm-1', currentVersion: 'v3', targetVersion: 'v3', servedVersions: ['v1', 'v2', 'v3'],
    })).rejects.toThrow('rollback-same-version:v3');
    await expect(svc.rollbackModelVersion('user-a', {
      modelId: 'm-1', currentVersion: 'v5', targetVersion: 'v2', servedVersions: ['v1', 'v2', 'v3'],
    })).rejects.toThrow('rollback-current-not-served:v5');
    expect(rollbacks.rows.length).toBe(0);
  });
});

describe('AI-040..044 zero trust (adversarial)', () => {
  it('another user cache is invisible: lookups miss and lists are empty', async () => {
    const { svc } = makeService();
    await svc.admitResponseCache('user-a', {
      modelId: 'm-1', prompt: 'Once upon a time', promptTokens: 8, outputTokens: 12, now: 100,
    });
    const cross = await svc.lookupResponse('user-b', { modelId: 'm-1', prompt: 'Once upon a time' });
    expect(cross.outcome).toBe('miss');
    expect(cross.entryId).toBeNull();
    expect((await svc.listCacheEntries('user-b')).length).toBe(0);
  });

  it('another user streams, metrics and shadows are invisible', async () => {
    const { svc } = makeService();
    await svc.openStream('user-a', { streamId: 'st-1', modelId: 'm-1' });
    await svc.recordServingMetric('user-a', { modelId: 'm-1', latencyMs: 600, tokens: 100, costUsd: 0.01 });
    await svc.createShadowDeployment('user-a', { championId: 'champ', challengerId: 'chall' });
    await expect(svc.getStream('user-b', 'st-1')).rejects.toThrow('stream-not-found:st-1');
    await expect(svc.buildServingMetrics('user-b', { modelId: 'm-1' })).rejects.toThrow('metrics-no-samples');
    await expect(svc.recordShadowPair('user-b', { championId: 'champ', challengerId: 'chall', agree: true }))
      .rejects.toThrow('shadow-deployment-not-found:champ:chall');
    expect((await svc.listShadowDeployments('user-b')).length).toBe(0);
  });

  it('another user rollback history is independent: the same flip is a new row, not a reuse', async () => {
    const { svc, rollbacks } = makeService();
    const dto = { modelId: 'm-1', currentVersion: 'v3', targetVersion: 'v2', servedVersions: ['v1', 'v2', 'v3'] };
    const mine = await svc.rollbackModelVersion('user-a', dto);
    expect(mine.reused).toBe(false);
    const theirs = await svc.rollbackModelVersion('user-b', dto);
    expect(theirs.reused).toBe(false);
    expect(rollbacks.rows.length).toBe(2);
    expect((await svc.listRollbackEvents('user-a', 'm-1')).length).toBe(1);
    expect((await svc.listRollbackEvents('user-b', 'm-1')).length).toBe(1);
  });
});
