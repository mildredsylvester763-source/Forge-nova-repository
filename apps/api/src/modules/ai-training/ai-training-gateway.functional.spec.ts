// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training-gateway.functional.spec.ts
// ============================================================================
// Service-level lifecycle + adversarial scenarios for the provider-neutral
// model gateway (FORGE AI-048..052): cheapest capable ACTIVE provider routing
// with the frozen failover chain, consecutive-failure circuit health that one
// success resets, BYOK keys that NEVER survive registration as raw material,
// the classification-ladder data policy, and honest per-provider accounting
// (real error rate, exact token sums, provider-rate cost). Every refusal is
// named; a refused operation stores nothing. Zero-trust throughout: one user
// never sees another user providers, routes, health, keys or usage.

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
    repos[24] as any, repos[25] as any, repos[26] as any, repos[27] as any,
    repos[28] as any, repos[29] as any, repos[30] as any, repos[31] as any,
    repos[32] as any,
    repos[33] as any, repos[34] as any, repos[35] as any, repos[36] as any, repos[37] as any,
  );
  return {
    svc,
    providers: repos[28] as RepoDouble<any>,
    routeEvents: repos[29] as RepoDouble<any>,
    health: repos[30] as RepoDouble<any>,
    byok: repos[31] as RepoDouble<any>,
    usage: repos[32] as RepoDouble<any>,
  };
};

const seedProviders = async (svc: AiTrainingService, userId: string) => {
  await svc.registerGatewayProvider(userId, { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
  await svc.registerGatewayProvider(userId, { providerId: 'p-small', costPer1kIn: 0.002, costPer1kOut: 0.004, maxTokens: 4000 });
  await svc.registerGatewayProvider(userId, { providerId: 'p-expensive', costPer1kIn: 0.01, costPer1kOut: 0.05, maxTokens: 32000 });
  await svc.registerGatewayProvider(userId, { providerId: 'p-off', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000, active: false });
};

describe('AI-048..052 model gateway (functional lifecycle)', () => {
  it('provider registration is an idempotent upsert per provider id and re-register updates the descriptor', async () => {
    const { svc, providers } = makeService();
    const first = await svc.registerGatewayProvider('user-a', { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
    expect(first.provider).toEqual({ id: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000, active: true });
    expect(first.fingerprint).toBe('byok_44a2d1f2');
    expect(providers.rows.length).toBe(1);
    const again = await svc.registerGatewayProvider('user-a', { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
    expect(again.duplicate).toBe(false);
    expect(providers.rows.length).toBe(1);
    const updated = await svc.registerGatewayProvider('user-a', { providerId: 'p-cheap', costPer1kIn: 0.003, costPer1kOut: 0.002, maxTokens: 8000 });
    expect(providers.rows.length).toBe(1);
    expect(updated.provider.costPer1kIn).toBe(0.003);
    expect((await svc.listGatewayProviders('user-a')).length).toBe(1);
  });

  it('routing picks the cheapest capable active provider, freezes the ranked chain and stores the route event', async () => {
    const { svc, routeEvents } = makeService();
    await seedProviders(svc, 'user-a');
    const routed = await svc.routeGatewayRequest('user-a', { promptTokens: 1000, outputTokens: 500 });
    expect(routed).toEqual({
      primaryId: 'p-cheap',
      chain: ['p-cheap', 'p-small', 'p-expensive'],
      estimatedCostUsd: 0.002,
      refusedInactive: ['p-off'],
      fingerprint: 'byok_16061149',
    });
    expect(routeEvents.rows.length).toBe(1);
    const bigger = await svc.routeGatewayRequest('user-a', { promptTokens: 4000, outputTokens: 500 });
    expect(bigger.primaryId).toBe('p-cheap');
    expect(bigger.chain).toEqual(['p-cheap', 'p-expensive']);
    expect(bigger.estimatedCostUsd).toBe(0.005);
    expect(routeEvents.rows.length).toBe(2);
    // A request no active provider can serve is refused by name and stores nothing.
    await expect(svc.routeGatewayRequest('user-a', { promptTokens: 40000, outputTokens: 1000 }))
      .rejects.toThrow('gateway-no-capable-provider:41000');
    expect(routeEvents.rows.length).toBe(2);
  });

  it('circuit health: three consecutive failures trip the breaker, one success resets it, failover never schedules unhealthy', async () => {
    const { svc, health } = makeService();
    await seedProviders(svc, 'user-a');
    const f1 = await svc.recordProviderOutcome('user-a', { providerId: 'p-cheap', ok: false });
    expect(f1).toEqual({ providerId: 'p-cheap', consecutiveFailures: 1, healthy: true });
    await svc.recordProviderOutcome('user-a', { providerId: 'p-cheap', ok: false });
    const f3 = await svc.recordProviderOutcome('user-a', { providerId: 'p-cheap', ok: false });
    expect(f3.consecutiveFailures).toBe(3);
    expect(f3.healthy).toBe(false);
    expect(health.rows.length).toBe(1);
    const listed = await svc.listProviderHealth('user-a');
    expect(listed).toEqual([{ providerId: 'p-cheap', consecutiveFailures: 3, healthy: false }]);
    const plan = await svc.planGatewayFailover('user-a', { promptTokens: 1000, outputTokens: 500, maxRetriesPerProvider: 2 });
    expect(plan).toEqual({
      chain: [
        { providerId: 'p-small', attempt: 1 },
        { providerId: 'p-small', attempt: 2 },
        { providerId: 'p-expensive', attempt: 1 },
        { providerId: 'p-expensive', attempt: 2 },
      ],
      unhealthy: ['p-cheap'],
      primaryId: 'p-small',
    });
    const reset = await svc.recordProviderOutcome('user-a', { providerId: 'p-cheap', ok: true });
    expect(reset.consecutiveFailures).toBe(0);
    expect(reset.healthy).toBe(true);
    const afterReset = await svc.planGatewayFailover('user-a', { promptTokens: 1000, outputTokens: 500, maxRetriesPerProvider: 2 });
    expect(afterReset.primaryId).toBe('p-cheap');
    expect(afterReset.unhealthy).toEqual([]);
    expect(health.rows.length).toBe(1);
  });

  it('BYOK: the raw key never survives registration, the fingerprint is deterministic and re-register is idempotent', async () => {
    const { svc, byok } = makeService();
    const registered = await svc.registerWorkspaceKey('user-a', {
      workspaceId: 'ws1', providerId: 'p-cheap', apiKey: 'sk-live-abcdef1234',
    });
    expect(registered).toEqual({
      workspaceId: 'ws1',
      providerId: 'p-cheap',
      key: { providerId: 'p-cheap', keyLength: 18, fingerprint: 'byok_63065484' },
    });
    expect(byok.rows.length).toBe(1);
    expect(JSON.stringify(byok.rows)).not.toContain('sk-live-abcdef1234');
    const keys = await svc.listWorkspaceKeys('user-a', 'ws1');
    expect(keys.length).toBe(1);
    expect(keys[0].key.fingerprint).toBe('byok_63065484');
    await svc.registerWorkspaceKey('user-a', { workspaceId: 'ws1', providerId: 'p-cheap', apiKey: 'sk-live-abcdef1234' });
    expect(byok.rows.length).toBe(1);
    await expect(svc.registerWorkspaceKey('user-a', { workspaceId: 'ws1', providerId: 'p-cheap', apiKey: 'short' }))
      .rejects.toThrow('byok-invalid-key');
    expect(byok.rows.length).toBe(1);
  });

  it('data policy: clearance ladder enforced, unknown tags and clearances refused by name, decisions store nothing', async () => {
    const { svc } = makeService();
    const allowed = await svc.checkDataPolicy('user-a', { dataTags: ['public', 'internal'], providerClearance: 'confidential' });
    expect(allowed).toEqual({
      allowedTags: ['public', 'internal'],
      maxTag: 'internal',
      providerClearance: 'confidential',
    });
    await expect(svc.checkDataPolicy('user-a', { dataTags: ['restricted'], providerClearance: 'internal' }))
      .rejects.toThrow('policy-clearance-exceeded:restricted>internal');
    await expect(svc.checkDataPolicy('user-a', { dataTags: ['topsecret'], providerClearance: 'internal' }))
      .rejects.toThrow('policy-unknown-tag:topsecret');
    await expect(svc.checkDataPolicy('user-a', { dataTags: ['public'], providerClearance: 'unknown' }))
      .rejects.toThrow('policy-unknown-clearance:unknown');
  });

  it('accounting is honest: real error rate, exact token sums, provider-rate cost, and no samples is a named refusal', async () => {
    const { svc, usage } = makeService();
    await svc.registerGatewayProvider('user-a', { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
    await svc.recordProviderUsage('user-a', { providerId: 'p-cheap', tokensIn: 1000, tokensOut: 500, latencyMs: 600, ok: true });
    await svc.recordProviderUsage('user-a', { providerId: 'p-cheap', tokensIn: 1500, tokensOut: 800, latencyMs: 900 });
    await svc.recordProviderUsage('user-a', { providerId: 'p-cheap', tokensIn: 1000, tokensOut: 900, latencyMs: 800, ok: false });
    expect(usage.rows.length).toBe(3);
    const accounting = await svc.buildProviderAccounting('user-a', { providerId: 'p-cheap' });
    expect(accounting).toEqual({
      providerId: 'p-cheap',
      requests: 3,
      failures: 1,
      errorRate: 0.333333,
      tokensIn: 3500,
      tokensOut: 2200,
      costUsd: 0.0079,
      avgLatencyMs: 766.666667,
    });
    // Usage for a provider this account never registered is refused by name.
    await expect(svc.recordProviderUsage('user-a', { providerId: 'p-none', tokensIn: 1, tokensOut: 1, latencyMs: 1 }))
      .rejects.toThrow('gateway-provider-not-found:p-none');
    expect(usage.rows.length).toBe(3);
    await expect(svc.buildProviderAccounting('user-a', { providerId: 'p-none' }))
      .rejects.toThrow('gateway-provider-not-found:p-none');
    // A registered provider with zero samples refuses accounting by name,
    // never invents zeros.
    await svc.registerGatewayProvider('user-c', { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
    await expect(svc.buildProviderAccounting('user-c', { providerId: 'p-cheap' }))
      .rejects.toThrow('accounting-no-samples');
  });
});

describe('AI-048..052 zero trust (adversarial)', () => {
  it('another user providers, routes, health, keys, usage and accounting are invisible', async () => {
    const { svc, routeEvents, byok } = makeService();
    await seedProviders(svc, 'user-a');
    await svc.routeGatewayRequest('user-a', { promptTokens: 1000, outputTokens: 500 });
    await svc.registerWorkspaceKey('user-a', { workspaceId: 'ws1', providerId: 'p-cheap', apiKey: 'sk-live-abcdef1234' });
    await svc.recordProviderUsage('user-a', { providerId: 'p-cheap', tokensIn: 100, tokensOut: 50, latencyMs: 100 });
    expect((await svc.listGatewayProviders('user-b')).length).toBe(0);
    await expect(svc.routeGatewayRequest('user-b', { promptTokens: 100, outputTokens: 50 }))
      .rejects.toThrow('gateway-no-providers');
    await expect(svc.planGatewayFailover('user-b', { promptTokens: 100, outputTokens: 50, maxRetriesPerProvider: 1 }))
      .rejects.toThrow('gateway-no-providers');
    // Health is scoped per user: user-b builds its own circuit truth and
    // never observes user-a providers.
    const own = await svc.recordProviderOutcome('user-b', { providerId: 'p-cheap', ok: false });
    expect(own).toEqual({ providerId: 'p-cheap', consecutiveFailures: 1, healthy: true });
    expect((await svc.listProviderHealth('user-b')).length).toBe(1);
    expect((await svc.listProviderHealth('user-a')).length).toBe(0);
    await expect(svc.recordProviderUsage('user-b', { providerId: 'p-cheap', tokensIn: 1, tokensOut: 1, latencyMs: 1 }))
      .rejects.toThrow('gateway-provider-not-found:p-cheap');
    await expect(svc.buildProviderAccounting('user-b', { providerId: 'p-cheap' }))
      .rejects.toThrow('gateway-provider-not-found:p-cheap');
    expect((await svc.listWorkspaceKeys('user-b', 'ws1')).length).toBe(0);
    // user-a truth is untouched by every user-b refusal.
    expect(routeEvents.rows.length).toBe(1);
    expect(byok.rows.length).toBe(1);
    expect((byok.rows[0] as any).userId).toBe('user-a');
  });
});
