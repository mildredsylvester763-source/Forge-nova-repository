// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/model-gateway-engine.spec.ts
// ============================================================================
// ENGINE tests for the provider-neutral model gateway (FORGE AI-048..052).
// Pinned hand-computed vectors pin the math; 4x500-case mulberry32(42)
// sweeps pin the invariants (cheapest-capable routing, circuit health,
// clearance monotonicity, honest accounting); order-independence tests pin
// determinism. No apostrophes inside single-quoted titles (repo law).

import {
  planGatewayRoute,
  recordProviderHealth,
  planFailoverChain,
  byokFingerprint,
  validateByokKey,
  enforceDataPolicy,
  aggregateProviderUsage,
  CLASSIFICATION_ORDER,
  ProviderDescriptor,
} from './model-gateway-engine';

const PROVIDERS: ProviderDescriptor[] = [
  { id: 'p-expensive', costPer1kIn: 0.01, costPer1kOut: 0.03, maxTokens: 8192, active: true },
  { id: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8192, active: true },
  { id: 'p-off', costPer1kIn: 0.001, costPer1kOut: 0.001, maxTokens: 8192, active: false },
  { id: 'p-small', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 2048, active: true },
];

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function orderings<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of orderings(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

describe('model gateway engine vectors (AI-048..052)', () => {
  it('routes to the cheapest capable active provider and returns the ranked failover chain', () => {
    const v = planGatewayRoute({ providers: PROVIDERS, promptTokens: 1000, outputTokens: 500 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toEqual({
      primaryId: 'p-cheap',
      chain: ['p-cheap', 'p-small', 'p-expensive'],
      estimatedCostUsd: 0.002,
      refusedInactive: ['p-off'],
    });
  });

  it('a provider without context room is skipped even when cheap', () => {
    const v = planGatewayRoute({
      providers: [PROVIDERS[0], PROVIDERS[3]],
      promptTokens: 4000,
      outputTokens: 500,
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.primaryId).toBe('p-expensive');
    expect(v.value.chain).toEqual(['p-expensive']);
    expect(v.value.estimatedCostUsd).toBe(0.055);
  });

  it('refusals are named: no providers, no active providers, no capable provider', () => {
    expect(planGatewayRoute({ providers: [], promptTokens: 1, outputTokens: 1 }))
      .toMatchObject({ ok: false, reason: 'gateway-no-providers' });
    expect(planGatewayRoute({ providers: [PROVIDERS[2]], promptTokens: 100, outputTokens: 100 }))
      .toMatchObject({ ok: false, reason: 'gateway-no-active-providers' });
    expect(planGatewayRoute({
      providers: [{ id: 'p-tiny', costPer1kIn: 0.001, costPer1kOut: 0.001, maxTokens: 100, active: true }],
      promptTokens: 1000,
      outputTokens: 500,
    })).toMatchObject({ ok: false, reason: 'gateway-no-capable-provider:1500' });
  });

  it('circuit health: failure increments, success resets, threshold marks unhealthy', () => {
    expect(recordProviderHealth({ providerId: 'p-cheap', consecutiveFailures: 2, ok: false }))
      .toMatchObject({ ok: true, value: { consecutiveFailures: 3, healthy: false } });
    expect(recordProviderHealth({ providerId: 'p-cheap', consecutiveFailures: 3, ok: true }))
      .toMatchObject({ ok: true, value: { consecutiveFailures: 0, healthy: true } });
    expect(recordProviderHealth({ providerId: 'p-cheap', consecutiveFailures: 1, ok: false }))
      .toMatchObject({ ok: true, value: { consecutiveFailures: 2, healthy: true } });
  });

  it('failover never schedules an unhealthy provider and names the empty-chain refusal', () => {
    const v = planFailoverChain({
      providers: PROVIDERS,
      health: { 'p-cheap': 3 },
      maxRetriesPerProvider: 2,
      promptTokens: 1000,
      outputTokens: 500,
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.primaryId).toBe('p-small');
    expect(v.value.unhealthy).toEqual(['p-cheap']);
    expect(v.value.chain).toEqual([
      { providerId: 'p-small', attempt: 1 },
      { providerId: 'p-small', attempt: 2 },
      { providerId: 'p-expensive', attempt: 1 },
      { providerId: 'p-expensive', attempt: 2 },
    ]);
  });

  it('failover with every provider unhealthy is refused by name', () => {
    const v = planFailoverChain({
      providers: PROVIDERS,
      health: { 'p-cheap': 3, 'p-expensive': 3, 'p-small': 3 },
      maxRetriesPerProvider: 2,
      promptTokens: 1000,
      outputTokens: 500,
    });
    expect(v).toMatchObject({ ok: false, reason: 'failover-no-healthy-providers' });
  });

  it('BYOK fingerprints are deterministic and the key itself never appears', () => {
    expect(byokFingerprint('p-cheap', 'sk-live-abcdef1234')).toBe('byok_63065484');
    expect(byokFingerprint('p-cheap', 'sk-live-abcdef1234')).toBe(byokFingerprint('p-cheap', 'sk-live-abcdef1234'));
    expect(byokFingerprint('p-other', 'sk-live-abcdef1234')).not.toBe('byok_63065484');
    expect(JSON.stringify(byokFingerprint('p-cheap', 'sk-live-abcdef1234'))).not.toContain('sk-live');
    expect(validateByokKey('short')).toMatchObject({ ok: false, reason: 'byok-invalid-key' });
    expect(validateByokKey('   sk-live-abcdef1234   ')).toMatchObject({ ok: true, value: { keyLength: 18 } });
  });

  it('data policy: clearance monotone, unknown tags and clearances refused by name', () => {
    expect(enforceDataPolicy({ dataTags: ['public', 'internal'], providerClearance: 'internal' }))
      .toMatchObject({ ok: true, value: { allowedTags: ['public', 'internal'], maxTag: 'internal' } });
    expect(enforceDataPolicy({ dataTags: ['confidential'], providerClearance: 'internal' }))
      .toMatchObject({ ok: false, reason: 'policy-clearance-exceeded:confidential>internal' });
    expect(enforceDataPolicy({ dataTags: ['topsecret'], providerClearance: 'internal' }))
      .toMatchObject({ ok: false, reason: 'policy-unknown-tag:topsecret' });
    expect(enforceDataPolicy({ dataTags: ['public'], providerClearance: 'everything' }))
      .toMatchObject({ ok: false, reason: 'policy-unknown-clearance:everything' });
    expect(enforceDataPolicy({ dataTags: [], providerClearance: 'restricted' }))
      .toMatchObject({ ok: true, value: { allowedTags: [], maxTag: null } });
  });

  it('provider accounting is honest: real error rate, exact sums, descriptor-priced cost', () => {
    const samples = [
      { tokensIn: 1000, tokensOut: 500, latencyMs: 800, ok: true },
      { tokensIn: 2000, tokensOut: 1500, latencyMs: 1200, ok: true },
      { tokensIn: 500, tokensOut: 200, latencyMs: 300, ok: false },
    ];
    const v = aggregateProviderUsage({
      providerId: 'p-cheap',
      descriptor: { costPer1kIn: 0.001, costPer1kOut: 0.002 },
      samples,
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toEqual({
      providerId: 'p-cheap',
      requests: 3,
      failures: 1,
      errorRate: 0.333333,
      tokensIn: 3500,
      tokensOut: 2200,
      costUsd: 0.0079,
      avgLatencyMs: 766.666667,
    });
    expect(aggregateProviderUsage({ providerId: 'p-cheap', descriptor: { costPer1kIn: 0.001, costPer1kOut: 0.002 }, samples: [] }))
      .toMatchObject({ ok: false, reason: 'accounting-no-samples' });
  });
});

describe('model gateway engine order independence', () => {
  it('routing, health, policy and accounting ignore input order', () => {
    for (const order of orderings(PROVIDERS)) {
      const v = planGatewayRoute({ providers: order, promptTokens: 1000, outputTokens: 500 });
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      expect(v.value.primaryId).toBe('p-cheap');
      expect(v.value.chain).toEqual(['p-cheap', 'p-small', 'p-expensive']);
    }
    const samples = [
      { tokensIn: 1000, tokensOut: 500, latencyMs: 800, ok: true },
      { tokensIn: 500, tokensOut: 200, latencyMs: 300, ok: false },
    ];
    for (const order of orderings(samples)) {
      const v = aggregateProviderUsage({
        providerId: 'p-cheap',
        descriptor: { costPer1kIn: 0.001, costPer1kOut: 0.002 },
        samples: order,
      });
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.value.costUsd).toBe(0.0019);
        expect(v.value.errorRate).toBe(0.5);
      }
    }
    for (const order of orderings(['public', 'internal'])) {
      const v = enforceDataPolicy({ dataTags: order, providerClearance: 'internal' });
      expect(v.ok).toBe(true);
    }
  });
});

describe('model gateway engine 500-case sweeps (mulberry32 seed 42)', () => {
  it('sweep A: the primary is always the cheapest capable active provider', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 4);
      const ps: ProviderDescriptor[] = [];
      for (let j = 0; j < n; j++) {
        ps.push({
          id: 'p-' + j,
          costPer1kIn: round6(rand() * 0.02),
          costPer1kOut: round6(rand() * 0.05),
          maxTokens: [512, 2048, 8192][Math.floor(rand() * 3)],
          active: rand() > 0.25,
        });
      }
      const pt = Math.floor(rand() * 1000) + 1;
      const ot = Math.floor(rand() * 1000) + 1;
      const r = planGatewayRoute({ providers: ps, promptTokens: pt, outputTokens: ot });
      const need = pt + ot;
      const best = ps
        .filter((p) => p.active && p.maxTokens >= need)
        .sort((a, b) =>
          a.costPer1kOut !== b.costPer1kOut
            ? a.costPer1kOut - b.costPer1kOut
            : a.id < b.id ? -1 : 1,
        )[0];
      if (best) {
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.value.primaryId).toBe(best.id);
          expect(r.value.chain[0]).toBe(r.value.primaryId);
        }
      } else {
        expect(r.ok).toBe(false);
      }
    }
  });

  it('sweep B: failover never schedules unhealthy providers and counts attempts exactly', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 4);
      const ps: ProviderDescriptor[] = [];
      for (let j = 0; j < n; j++) {
        ps.push({
          id: 'p-' + j,
          costPer1kIn: round6(rand() * 0.02),
          costPer1kOut: round6(rand() * 0.05),
          maxTokens: 8192,
          active: true,
        });
      }
      const health: Record<string, number> = {};
      for (const p of ps) health[p.id] = Math.floor(rand() * 5);
      const retries = 1 + Math.floor(rand() * 3);
      const v = planFailoverChain({
        providers: ps,
        health,
        maxRetriesPerProvider: retries,
        promptTokens: 100,
        outputTokens: 100,
      });
      const healthyCount = ps.filter((p) => health[p.id] < 3).length;
      if (healthyCount === 0) {
        expect(v.reason).toBe('failover-no-healthy-providers');
      } else {
        expect(v.ok).toBe(true);
        if (!v.ok) continue;
        expect(v.value.chain).toHaveLength(healthyCount * retries);
        for (const step of v.value.chain) {
          expect(health[step.providerId]).toBeLessThan(3);
        }
        const perProvider = new Map<string, number>();
        for (const step of v.value.chain) {
          perProvider.set(step.providerId, (perProvider.get(step.providerId) ?? 0) + 1);
        }
        for (const count of perProvider.values()) {
          expect(count).toBe(retries);
        }
      }
    }
  });

  it('sweep C: policy is monotone in the classification ladder and refuses unknowns', () => {
    const rand = mulberry32(42);
    const tagPool = CLASSIFICATION_ORDER.concat(['bogus']);
    for (let i = 0; i < 500; i++) {
      const tag = tagPool[Math.floor(rand() * tagPool.length)];
      const clearance = CLASSIFICATION_ORDER[Math.floor(rand() * CLASSIFICATION_ORDER.length)];
      const v = enforceDataPolicy({ dataTags: [tag], providerClearance: clearance });
      if (tag === 'bogus') {
        expect(v.reason).toBe('policy-unknown-tag:bogus');
      } else if (CLASSIFICATION_ORDER.indexOf(tag) > CLASSIFICATION_ORDER.indexOf(clearance)) {
        expect(v.reason).toBe('policy-clearance-exceeded:' + tag + '>' + clearance);
      } else {
        expect(v.ok).toBe(true);
      }
    }
  });

  it('sweep D: accounting sums, error rate and cost match manual computation exactly', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const s: Array<{ tokensIn: number; tokensOut: number; latencyMs: number; ok: boolean }> = [];
      const count = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < count; k++) {
        s.push({
          tokensIn: Math.floor(rand() * 3000),
          tokensOut: Math.floor(rand() * 3000),
          latencyMs: Math.floor(rand() * 2000),
          ok: rand() > 0.3,
        });
      }
      const cin = round6(rand() * 0.01);
      const cout = round6(rand() * 0.03);
      const v = aggregateProviderUsage({
        providerId: 'p-x',
        descriptor: { costPer1kIn: cin, costPer1kOut: cout },
        samples: s,
      });
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      const tin = s.reduce((a, b) => a + b.tokensIn, 0);
      const tout = s.reduce((a, b) => a + b.tokensOut, 0);
      const fails = s.filter((x) => !x.ok).length;
      expect(v.value.tokensIn).toBe(tin);
      expect(v.value.tokensOut).toBe(tout);
      expect(v.value.requests).toBe(count);
      expect(v.value.failures).toBe(fails);
      expect(v.value.costUsd).toBe(round6((tin / 1000) * cin + (tout / 1000) * cout));
    }
  });
});
