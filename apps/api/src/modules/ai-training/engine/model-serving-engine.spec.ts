// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/model-serving-engine.spec.ts
// ============================================================================
// PINNED VECTORS + ORDER-INDEPENDENCE + SWEEP for the serving engine (FORGE
// AI-036..AI-039). Every vector was hand-computed and sandbox-verified before
// this file was written. The 500-case mulberry32(42) sweep asserts the hard
// laws: assigned replicas always sum to the plan, MIN_REPLICAS never breaks,
// cautious scale-down moves exactly one step, GPU slots are never crossed,
// worst-case routing cost never exceeds the cap, and the primary is always
// the cheapest capable model.

import {
  planServingScale,
  buildQuantizationPlan,
  buildOnDeviceBundle,
  routeModel,
  Verdict,
  MIN_REPLICAS,
  MIN_CALIBRATION_SAMPLES,
  OFFLINE_RUNTIMES,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from './model-serving-engine';

const reasonOf = (v: Verdict<unknown>): string => (v as { ok: false; reason: string }).reason;
const valueOf = <T>(v: Verdict<T>): T => (v as { ok: true; value: T }).value;
const ok = (v: Verdict<unknown>): boolean => (v as { ok: boolean }).ok === true;

/** mulberry32 — deterministic PRNG for the sweep (pinned seed 42). */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All orderings of n items — serialization orders a caller can produce. */
function orderings<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of orderings(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

const GPUS = [
  { id: 'gpu-0', replicaSlots: 2 },
  { id: 'gpu-1', replicaSlots: 2 },
];

describe('model-serving engine pinned vectors (AI-036 scaling + GPU pool)', () => {
  it('scales a small burst to one replica with honest projected utilization', () => {
    const v = valueOf(planServingScale({
      modelId: 'm1', requestsPerSecond: 10, avgLatencyMs: 500, replicaConcurrency: 10, gpus: GPUS,
    }));
    expect(v.replicas).toBe(1);
    expect(v.neededRaw).toBe(1);
    expect(v.scaledDownCautiously).toBe(false);
    expect(v.assigned).toEqual([{ gpuId: 'gpu-0', replicas: 1 }]);
    expect(v.projectedUtilization).toBe(0.5);
  });

  it('refuses a plan that would cross the replica cap, by name', () => {
    const v = planServingScale({
      modelId: 'm1', requestsPerSecond: 100, avgLatencyMs: 2000, replicaConcurrency: 20,
      maxReplicas: 8, gpus: [{ id: 'g', replicaSlots: 99 }],
    });
    expect(ok(v)).toBe(false);
    expect(reasonOf(v)).toBe('scaling-replicas-capped:15>8');
  });

  it('scales down cautiously: exactly one replica per decision, never a cliff', () => {
    const v = valueOf(planServingScale({
      modelId: 'm1', requestsPerSecond: 1, avgLatencyMs: 100, replicaConcurrency: 50,
      currentReplicas: 5, gpus: [{ id: 'gpu-0', replicaSlots: 9 }],
    }));
    expect(v.scaledDownCautiously).toBe(true);
    expect(v.replicas).toBe(4);
    expect(v.neededRaw).toBe(1);
    expect(v.projectedUtilization).toBe(0.0005);
  });

  it('refuses to under-provision when the GPU pool cannot hold the plan', () => {
    const v = planServingScale({
      modelId: 'm1', requestsPerSecond: 60, avgLatencyMs: 1000, replicaConcurrency: 10,
      gpus: [{ id: 'a', replicaSlots: 1 }, { id: 'b', replicaSlots: 1 }],
    });
    expect(reasonOf(v)).toBe('scaling-pool-exhausted:9>2');
  });

  it('assigns replicas round-robin over GPUs sorted by id, deterministically', () => {
    const v = valueOf(planServingScale({
      modelId: 'm1', requestsPerSecond: 30, avgLatencyMs: 1000, replicaConcurrency: 10,
      gpus: [{ id: 'gpu-b', replicaSlots: 3 }, { id: 'gpu-a', replicaSlots: 3 }],
    }));
    expect(v.assigned).toEqual([
      { gpuId: 'gpu-a', replicas: 3 },
      { gpuId: 'gpu-b', replicas: 2 },
    ]);
  });

  it('holds MIN_REPLICAS even at zero traffic — the pool stays warm', () => {
    const v = valueOf(planServingScale({
      modelId: 'm1', requestsPerSecond: 0, avgLatencyMs: 100, replicaConcurrency: 10,
      gpus: [{ id: 'g', replicaSlots: 1 }],
    }));
    expect(v.replicas).toBe(MIN_REPLICAS);
    expect(v.neededRaw).toBe(0);
    expect(v.projectedUtilization).toBe(0);
  });

  it('zero traffic from a warm pool still steps down one at a time', () => {
    const v = valueOf(planServingScale({
      modelId: 'm1', requestsPerSecond: 0, avgLatencyMs: 100, replicaConcurrency: 10,
      currentReplicas: 5, gpus: [{ id: 'g', replicaSlots: 9 }],
    }));
    expect(v.scaledDownCautiously).toBe(true);
    expect(v.replicas).toBe(4);
  });

  it('names malformed scale inputs', () => {
    expect(reasonOf(planServingScale({ modelId: '', requestsPerSecond: 1, avgLatencyMs: 1, replicaConcurrency: 1, gpus: GPUS } as never))).toBe('scaling-no-model');
    expect(reasonOf(planServingScale({ modelId: 'm', requestsPerSecond: -1, avgLatencyMs: 1, replicaConcurrency: 1, gpus: GPUS } as never))).toBe('scaling-invalid-rps:-1');
    expect(reasonOf(planServingScale({ modelId: 'm', requestsPerSecond: 1, avgLatencyMs: 0, replicaConcurrency: 1, gpus: GPUS } as never))).toBe('scaling-invalid-latency:0');
    expect(reasonOf(planServingScale({ modelId: 'm', requestsPerSecond: 1, avgLatencyMs: 1, replicaConcurrency: 0, gpus: GPUS } as never))).toBe('scaling-invalid-concurrency:0');
    expect(reasonOf(planServingScale({ modelId: 'm', requestsPerSecond: 1, avgLatencyMs: 1, replicaConcurrency: 1, targetUtilization: 2, gpus: GPUS } as never))).toBe('scaling-invalid-target:2');
    expect(reasonOf(planServingScale({ modelId: 'm', requestsPerSecond: 1, avgLatencyMs: 1, replicaConcurrency: 1, gpus: [] } as never))).toBe('scaling-no-gpu-pool');
  });
});

describe('model-serving engine pinned vectors (AI-037 quantization)', () => {
  it('builds an honest INT8 plan: 4x compression, loss inside the budget', () => {
    const v = valueOf(buildQuantizationPlan({
      modelId: 'm1', weightsBytes: 4000000000, method: 'int8', calibrationSamples: 64, qualityBudget: 0.02,
    }));
    expect(v.method).toBe('int8');
    expect(v.bits).toBe(8);
    expect(v.sizeFactor).toBe(0.25);
    expect(v.compressedBytes).toBe(1000000000);
    expect(v.estimatedQualityLoss).toBe(0.01);
    expect(v.calibrationSamples).toBe(64);
    expect(v.fingerprint).toMatch(/^quantfp_[0-9a-f]{8}$/);
  });

  it('refuses INT4 when it would blow the quality budget, by name', () => {
    const v = buildQuantizationPlan({
      modelId: 'm1', weightsBytes: 4000000000, method: 'int4', calibrationSamples: 64, qualityBudget: 0.02,
    });
    expect(reasonOf(v)).toBe('quantization-quality-budget-exceeded:0.03>0.02');
  });

  it('refuses calibration under the floor — honest PTQ needs calibration data', () => {
    const v = buildQuantizationPlan({
      modelId: 'm1', weightsBytes: 1000, method: 'fp16', calibrationSamples: 16, qualityBudget: 0.1,
    });
    expect(reasonOf(v)).toBe('quantization-insufficient-samples:16<' + MIN_CALIBRATION_SAMPLES);
  });

  it('refuses unknown methods and malformed weights by name', () => {
    expect(reasonOf(buildQuantizationPlan({ modelId: 'm1', weightsBytes: 1000, method: 'fp8', calibrationSamples: 64, qualityBudget: 1 }))).toBe('quantization-unknown-method:fp8');
    expect(reasonOf(buildQuantizationPlan({ modelId: 'm1', weightsBytes: 0, method: 'int8', calibrationSamples: 64, qualityBudget: 1 }))).toBe('quantization-invalid-weights:0');
  });

  it('the same inputs always fingerprint identically (replayable)', () => {
    const a = valueOf(buildQuantizationPlan({ modelId: 'm1', weightsBytes: 12345, method: 'int8', calibrationSamples: 64, qualityBudget: 1 })).fingerprint;
    const b = valueOf(buildQuantizationPlan({ modelId: 'm1', weightsBytes: 12345, method: 'int8', calibrationSamples: 64, qualityBudget: 0.05 })).fingerprint;
    expect(a).toBe(b);
  });
});

describe('model-serving engine pinned vectors (AI-038 on-device bundles)', () => {
  it('builds a bundle that fits with honest headroom bytes and ratio', () => {
    const v = valueOf(buildOnDeviceBundle({
      modelId: 'm1', quantizedBytes: 800000000, deviceMemoryBytes: 2000000000, runtime: 'llama.cpp',
    }));
    expect(v.headroomBytes).toBe(1200000000);
    expect(v.headroomRatio).toBe(0.6);
    expect(v.fingerprint).toMatch(/^bundlefp_[0-9a-f]{8}$/);
    expect(OFFLINE_RUNTIMES).toContain('llama.cpp');
  });

  it('refuses a bundle that would not fit device memory, by name', () => {
    const v = buildOnDeviceBundle({
      modelId: 'm1', quantizedBytes: 3000000000, deviceMemoryBytes: 2000000000, runtime: 'tflite',
    });
    expect(reasonOf(v)).toBe('bundle-exceeds-device-memory:3000000000>2000000000');
  });

  it('refuses runtimes that are not real offline runtimes, by name', () => {
    const v = buildOnDeviceBundle({ modelId: 'm1', quantizedBytes: 1, deviceMemoryBytes: 2, runtime: 'cuda' });
    expect(reasonOf(v)).toBe('bundle-no-offline-runtime:cuda');
  });

  it('names malformed bundle inputs', () => {
    expect(reasonOf(buildOnDeviceBundle({ modelId: '', quantizedBytes: 1, deviceMemoryBytes: 2, runtime: 'tflite' } as never))).toBe('bundle-no-model');
    expect(reasonOf(buildOnDeviceBundle({ modelId: 'm', quantizedBytes: 0, deviceMemoryBytes: 2, runtime: 'tflite' } as never))).toBe('bundle-invalid-size:0');
    expect(reasonOf(buildOnDeviceBundle({ modelId: 'm', quantizedBytes: 1, deviceMemoryBytes: 0, runtime: 'tflite' } as never))).toBe('bundle-invalid-device-memory:0');
  });
});

describe('model-serving engine pinned vectors (AI-039 cascade routing)', () => {
  const MODELS = [
    { id: 'cheap', costPer1kTokens: 0.001, maxTokens: 4096 },
    { id: 'big', costPer1kTokens: 0.01, maxTokens: 8192 },
  ];

  it('routes cheap-first with the full escalation chain priced under the cap', () => {
    const v = valueOf(routeModel({ promptTokens: 1000, costCap: 0.05, models: MODELS }));
    expect(v.primary).toBe('cheap');
    expect(v.chain).toEqual(['cheap', 'big']);
    expect(v.primaryCost).toBe(0.001);
    expect(v.worstCaseCost).toBe(0.011);
    expect(v.truncatedByCap).toBe(false);
    expect(v.confidenceThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(v.escalateWhenBelow).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
  });

  it('truncates the chain at the cap and NAMES the truncation, never silent', () => {
    const v = valueOf(routeModel({ promptTokens: 1000, costCap: 0.005, models: MODELS }));
    expect(v.chain).toEqual(['cheap']);
    expect(v.worstCaseCost).toBe(0.001);
    expect(v.truncatedByCap).toBe(true);
  });

  it('refuses outright when even the primary blows the cap, by name', () => {
    const v = routeModel({ promptTokens: 1000, costCap: 0.0005, models: [MODELS[0]] });
    expect(reasonOf(v)).toBe('routing-cap-below-primary:0.001>0.0005');
  });

  it('refuses a prompt no model can hold, naming the widest context', () => {
    const v = routeModel({ promptTokens: 9000, costCap: 1, models: MODELS });
    expect(reasonOf(v)).toBe('routing-prompt-too-long:9000>8192');
  });

  it('refuses inactive, duplicate and malformed models by name', () => {
    expect(reasonOf(routeModel({ promptTokens: 10, costCap: 1, models: [{ id: 'cheap', costPer1kTokens: 0.001, maxTokens: 4096, active: false }] }))).toBe('routing-inactive-model:cheap');
    expect(reasonOf(routeModel({ promptTokens: 10, costCap: 1, models: [{ id: 'x', costPer1kTokens: 0.001, maxTokens: 100 }, { id: 'x', costPer1kTokens: 0.002, maxTokens: 100 }] }))).toBe('routing-duplicate-model:x');
    expect(reasonOf(routeModel({ promptTokens: 10, costCap: 1, models: [{ id: 'x', costPer1kTokens: -1, maxTokens: 100 }] }))).toBe('routing-invalid-cost:x');
    expect(reasonOf(routeModel({ promptTokens: 10, costCap: 1, models: [] as never }))).toBe('routing-no-models');
    expect(reasonOf(routeModel({ promptTokens: -1, costCap: 1, models: MODELS } as never))).toBe('routing-invalid-tokens:-1');
    expect(reasonOf(routeModel({ promptTokens: 10, costCap: -1, models: MODELS } as never))).toBe('routing-invalid-cap:-1');
    expect(reasonOf(routeModel({ promptTokens: 10, costCap: 1, confidenceThreshold: 2, models: MODELS } as never))).toBe('routing-invalid-threshold:2');
  });

  it('breaks cost ties by id — the plan never depends on input order', () => {
    const v = valueOf(routeModel({
      promptTokens: 500, costCap: 1,
      models: [
        { id: 'b', costPer1kTokens: 0.001, maxTokens: 1000 },
        { id: 'a', costPer1kTokens: 0.001, maxTokens: 1000 },
      ],
    }));
    expect(v.primary).toBe('a');
    expect(v.chain).toEqual(['a', 'b']);
  });

  it('is order-independent across ALL permutations of the model list', () => {
    for (const perm of orderings(MODELS)) {
      const v = valueOf(routeModel({ promptTokens: 1000, costCap: 0.05, models: perm }));
      expect(v.primary).toBe('cheap');
      expect(v.chain).toEqual(['cheap', 'big']);
      expect(v.worstCaseCost).toBe(0.011);
    }
    for (const perm of orderings([
      { id: 'gpu-b', replicaSlots: 3 },
      { id: 'gpu-a', replicaSlots: 3 },
    ])) {
      const v = valueOf(planServingScale({
        modelId: 'm1', requestsPerSecond: 30, avgLatencyMs: 1000, replicaConcurrency: 10, gpus: perm,
      }));
      expect(v.assigned).toEqual([
        { gpuId: 'gpu-a', replicas: 3 },
        { gpuId: 'gpu-b', replicas: 2 },
      ]);
    }
  });
});

describe('model-serving engine 500-case mulberry32(42) sweep', () => {
  it('scaling: assigned sums equal the plan, MIN_REPLICAS holds, slots never crossed', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const rps = Math.floor(rnd() * 200);
      const lat = 10 + Math.floor(rnd() * 4000);
      const conc = 1 + Math.floor(rnd() * 64);
      const cur = Math.floor(rnd() * 10);
      const s1 = Math.floor(rnd() * 4);
      const s2 = Math.floor(rnd() * 4);
      const v = planServingScale({
        modelId: 'm', requestsPerSecond: rps, avgLatencyMs: lat, replicaConcurrency: conc,
        currentReplicas: cur,
        gpus: [{ id: 'a', replicaSlots: s1 }, { id: 'b', replicaSlots: s2 }],
      });
      if (!ok(v)) {
        expect(reasonOf(v)).toMatch(/^scaling-(pool-exhausted|replicas-capped)/);
        continue;
      }
      const p = valueOf(v);
      expect(p.replicas).toBeGreaterThanOrEqual(MIN_REPLICAS);
      expect(p.assigned.reduce((n, g) => n + g.replicas, 0)).toBe(p.replicas);
      expect(p.assigned[0].replicas).toBeLessThanOrEqual(s1);
      expect(p.assigned[1].replicas).toBeLessThanOrEqual(s2);
      if (p.scaledDownCautiously) {
        expect(p.replicas).toBe(Math.max(MIN_REPLICAS, cur - 1));
      } else if (cur > 0) {
        expect(p.replicas).toBeGreaterThanOrEqual(Math.max(MIN_REPLICAS, p.neededRaw));
      }
    }
  });

  it('routing: primary is cheapest-capable, worst case never crosses the cap, plans replay', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const tokens = Math.floor(rnd() * 9000);
      const cap = r6s(rnd() * 0.2);
      const models = [
        { id: 'a', costPer1kTokens: r6s(rnd() * 0.02), maxTokens: 4096 },
        { id: 'b', costPer1kTokens: r6s(0.02 + rnd() * 0.02), maxTokens: 8192 },
      ];
      const v = routeModel({ promptTokens: tokens, costCap: cap, models });
      if (!ok(v)) {
        expect(reasonOf(v)).toMatch(/^routing-(prompt-too-long|cap-below-primary)/);
        continue;
      }
      const p = valueOf(v);
      const again = valueOf(routeModel({ promptTokens: tokens, costCap: cap, models }));
      expect(JSON.stringify(again)).toBe(JSON.stringify(p));
      expect(p.worstCaseCost).toBeLessThanOrEqual(cap);
      expect(p.chain[0]).toBe(p.primary);
      const primary = models.find((m) => m.id === p.primary) as { costPer1kTokens: number; maxTokens: number };
      const cheaper = models.filter((m) => m.costPer1kTokens < primary.costPer1kTokens || (m.costPer1kTokens === primary.costPer1kTokens && m.id < primary.id));
      for (const m of cheaper) {
        if (tokens <= m.maxTokens) throw new Error('sweep: a cheaper capable model was skipped: ' + m.id);
      }
      expect(p.chain.length).toBeGreaterThanOrEqual(1);
    }
  });
});

/** round to 6 — keeps sweep costs comparable to engine output precision. */
function r6s(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
