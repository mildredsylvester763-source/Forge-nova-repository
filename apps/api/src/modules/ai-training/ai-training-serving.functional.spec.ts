// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-serving.functional.spec.ts
// ============================================================================
// Service-level lifecycle + adversarial scenarios for model serving (FORGE
// AI-036..039): inference autoscaling with GPU pooling, quantization,
// on-device offline bundles, and cheap-first cascade routing. Every refusal
// is named; a refused plan stores NOTHING; double-taps are idempotent by
// plan content or fingerprint — never silently absorbed. Zero-trust
// throughout: one user never sees another user's plans or routes.

import { AiTrainingService } from './ai-training.service';

/** Test double for a TypeORM repository. Id-upsert save, where filters,
 *  order support (createdAt ASC), findOne. */
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
    scalePlans: repos[16] as RepoDouble<any>,
    quantPlans: repos[17] as RepoDouble<any>,
    bundles: repos[18] as RepoDouble<any>,
    decisions: repos[19] as RepoDouble<any>,
  };
};

const gpus = (aSlots: number, bSlots: number) => [
  { id: 'gpu-b', replicaSlots: bSlots },
  { id: 'gpu-a', replicaSlots: aSlots },
];

const cascade = () => [
  { id: 'mid', costPer1kTokens: 0.01, maxTokens: 8192 },
  { id: 'cheap', costPer1kTokens: 0.001, maxTokens: 8192 },
];

describe('AI-036..039 model serving service (functional lifecycle)', () => {
  it('plans serving scale from Littles law with deterministic round-robin GPU assignment', async () => {
    const { svc, scalePlans } = makeService();
    const plan = await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 35, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, gpus: gpus(3, 2),
    });
    expect(plan.reused).toBe(false);
    expect(plan.plan.replicas).toBe(5);
    expect(plan.plan.neededRaw).toBe(5);
    expect(plan.plan.scaledDownCautiously).toBe(false);
    expect(plan.plan.projectedUtilization).toBe(0.7);
    expect(plan.plan.assigned).toEqual([
      { gpuId: 'gpu-a', replicas: 3 },
      { gpuId: 'gpu-b', replicas: 2 },
    ]);
    expect((await scalePlans.find({})).length).toBe(1);
  });

  it('scale-down is cautious: exactly one replica step, floored at one', async () => {
    const { svc } = makeService();
    const plan = await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 7, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7,
      currentReplicas: 5, gpus: gpus(8, 8),
    });
    expect(plan.plan.neededRaw).toBe(2);
    expect(plan.plan.replicas).toBe(4);
    expect(plan.plan.scaledDownCautiously).toBe(true);
    expect(plan.plan.projectedUtilization).toBe(0.175);
    expect(plan.plan.assigned).toEqual([
      { gpuId: 'gpu-a', replicas: 2 },
      { gpuId: 'gpu-b', replicas: 2 },
    ]);
  });

  it('an identical re-plan reuses the stored row; a changed plan appends', async () => {
    const { svc, scalePlans } = makeService();
    const first = await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 7, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, gpus: gpus(8, 8),
    });
    expect(first.plan.replicas).toBe(2);
    const again = await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 7, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, gpus: gpus(8, 8),
    });
    expect(again.reused).toBe(true);
    expect(again.id).toBe(first.id);
    expect((await scalePlans.find({})).length).toBe(1);
    const grown = await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 35, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, gpus: gpus(8, 8),
    });
    expect(grown.reused).toBe(false);
    expect(grown.plan.replicas).toBe(5);
    const rows = await svc.getServingScalePlans('user-a', 'm-1');
    expect(rows.length).toBe(2);
    expect(rows[0].plan.replicas).toBe(2);
    expect(rows[1].plan.replicas).toBe(5);
  });

  it('quantization plans compress honestly and are fingerprint-idempotent', async () => {
    const { svc, quantPlans } = makeService();
    const dto = {
      modelId: 'm-1', weightsBytes: 4e9, method: 'int8' as const,
      calibrationSamples: 64, qualityBudget: 0.02,
    };
    const plan = await svc.buildQuantization('user-a', dto);
    expect(plan.reused).toBe(false);
    expect(plan.plan.compressedBytes).toBe(1e9);
    expect(plan.plan.sizeFactor).toBe(0.25);
    expect(plan.plan.estimatedQualityLoss).toBe(0.01);
    expect(plan.plan.calibrationSamples).toBe(64);
    expect(plan.method).toBe('int8');
    expect(plan.fingerprint).toBe('quantfp_639a25ab');
    const again = await svc.buildQuantization('user-a', dto);
    expect(again.reused).toBe(true);
    expect(again.id).toBe(plan.id);
    expect((await quantPlans.find({})).length).toBe(1);
  });

  it('on-device bundles report headroom in bytes and ratio and are fingerprint-idempotent', async () => {
    const { svc, bundles } = makeService();
    const dto = { modelId: 'm-1', quantizedBytes: 2e9, deviceMemoryBytes: 8e9, runtime: 'llama.cpp' };
    const bundle = await svc.buildBundle('user-a', dto);
    expect(bundle.reused).toBe(false);
    expect(bundle.bundle.headroomBytes).toBe(6e9);
    expect(bundle.bundle.headroomRatio).toBe(0.75);
    expect(bundle.runtime).toBe('llama.cpp');
    expect(bundle.fingerprint).toBe('bundlefp_2a92ed3e');
    const again = await svc.buildBundle('user-a', dto);
    expect(again.reused).toBe(true);
    expect(again.id).toBe(bundle.id);
    expect((await bundles.find({})).length).toBe(1);
  });

  it('cascade routing picks the cheapest capable primary and logs every decision with truncation truth', async () => {
    const { svc } = makeService();
    const route = await svc.routePrompt('user-a', {
      promptTokens: 1000, models: cascade(), costCap: 0.02,
    });
    expect(route.primary).toBe('cheap');
    expect(route.promptTokens).toBe(1000);
    expect(route.plan.primaryCost).toBe(0.001);
    expect(route.plan.worstCaseCost).toBe(0.011);
    expect(route.plan.chain).toEqual(['cheap', 'mid']);
    expect(route.plan.truncatedByCap).toBe(false);
    await svc.routePrompt('user-a', {
      promptTokens: 1000, models: cascade(), costCap: 0.002,
    });
    const rows = await svc.listRoutingDecisions('user-a');
    expect(rows.length).toBe(2);
    expect(rows[0].plan.truncatedByCap).toBe(false);
    expect(rows[1].plan.truncatedByCap).toBe(true);
    expect(rows[1].plan.chain).toEqual(['cheap']);
    expect(rows[1].plan.worstCaseCost).toBe(0.001);
  });
});

describe('AI-036..039 model serving service (adversarial scenarios)', () => {
  it('S1 a capped plan is refused by name and stores nothing', async () => {
    const { svc, scalePlans } = makeService();
    await expect(svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 14, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, maxReplicas: 1,
      gpus: gpus(8, 8),
    })).rejects.toThrow('scaling-replicas-capped:3>1');
    expect((await scalePlans.find({})).length).toBe(0);
  });

  it('S2 an exhausted GPU pool is refused by name and stores nothing', async () => {
    const { svc, scalePlans } = makeService();
    await expect(svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 35, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7,
      gpus: [{ id: 'gpu-a', replicaSlots: 1 }],
    })).rejects.toThrow('scaling-pool-exhausted:5>1');
    expect((await scalePlans.find({})).length).toBe(0);
  });

  it('S3 quantization refusals store nothing: budget blown, calibration under floor', async () => {
    const { svc, quantPlans } = makeService();
    await expect(svc.buildQuantization('user-a', {
      modelId: 'm-1', weightsBytes: 4e9, method: 'int4',
      calibrationSamples: 64, qualityBudget: 0.02,
    })).rejects.toThrow('quantization-quality-budget-exceeded:0.03>0.02');
    await expect(svc.buildQuantization('user-a', {
      modelId: 'm-1', weightsBytes: 4e9, method: 'int8',
      calibrationSamples: 16, qualityBudget: 0.02,
    })).rejects.toThrow('quantization-insufficient-samples:16<32');
    expect((await quantPlans.find({})).length).toBe(0);
  });

  it('S4 bundle refusals store nothing: oversized bundle, fake offline runtime', async () => {
    const { svc, bundles } = makeService();
    await expect(svc.buildBundle('user-a', {
      modelId: 'm-1', quantizedBytes: 9e9, deviceMemoryBytes: 8e9, runtime: 'llama.cpp',
    })).rejects.toThrow('bundle-exceeds-device-memory:9000000000>8000000000');
    await expect(svc.buildBundle('user-a', {
      modelId: 'm-1', quantizedBytes: 1e9, deviceMemoryBytes: 8e9, runtime: 'cloud-proxy',
    })).rejects.toThrow('bundle-no-offline-runtime:cloud-proxy');
    expect((await bundles.find({})).length).toBe(0);
  });

  it('S5 routing refusals store nothing: cap below primary, prompt too long, inactive model', async () => {
    const { svc, decisions } = makeService();
    await expect(svc.routePrompt('user-a', {
      promptTokens: 1000, models: cascade(), costCap: 0.0005,
    })).rejects.toThrow('routing-cap-below-primary:0.001>0.0005');
    await expect(svc.routePrompt('user-a', {
      promptTokens: 9000, models: cascade(), costCap: 0.02,
    })).rejects.toThrow('routing-prompt-too-long:9000>8192');
    await expect(svc.routePrompt('user-a', {
      promptTokens: 1000,
      models: [...cascade(), { id: 'sleepy', costPer1kTokens: 0.005, maxTokens: 4096, active: false }],
      costCap: 0.02,
    })).rejects.toThrow('routing-inactive-model:sleepy');
    expect((await decisions.find({})).length).toBe(0);
  });

  it('S6 zero-trust: another user reads no plans and no routes, and owns separate fingerprint rows', async () => {
    const { svc, scalePlans, quantPlans } = makeService();
    await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 7, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, gpus: gpus(8, 8),
    });
    await svc.buildQuantization('user-a', {
      modelId: 'm-1', weightsBytes: 4e9, method: 'int8',
      calibrationSamples: 64, qualityBudget: 0.02,
    });
    await svc.routePrompt('user-a', { promptTokens: 1000, models: cascade(), costCap: 0.02 });
    await expect(svc.getServingScalePlans('user-b', 'm-1'))
      .rejects.toThrow('serving-plans-not-found:m-1');
    expect((await svc.listRoutingDecisions('user-b')).length).toBe(0);
    const stranger = await svc.buildQuantization('user-b', {
      modelId: 'm-1', weightsBytes: 4e9, method: 'int8',
      calibrationSamples: 64, qualityBudget: 0.02,
    });
    expect(stranger.reused).toBe(false);
    expect((await quantPlans.find({})).length).toBe(2);
    expect((await scalePlans.find({ where: { userId: 'user-b' } })).length).toBe(0);
  });

  it('S7 scale history never leaks between models', async () => {
    const { svc } = makeService();
    await svc.planServingScale('user-a', {
      modelId: 'm-1', requestsPerSecond: 7, avgLatencyMs: 100,
      replicaConcurrency: 1, targetUtilization: 0.7, gpus: gpus(8, 8),
    });
    await expect(svc.getServingScalePlans('user-a', 'm-2'))
      .rejects.toThrow('serving-plans-not-found:m-2');
  });
});
