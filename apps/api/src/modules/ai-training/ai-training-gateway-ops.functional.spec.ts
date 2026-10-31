// Service-level lifecycle + adversarial scenarios for gateway operations
// (FORGE AI-053..056): prompt/response logs that are redacted BEFORE storage
// and fingerprint-idempotent over raw content; zero-retention workspaces that
// store no content at all; the capability registry routing matches against;
// and unified tool-calling with structured-output validation. Every refusal is
// named and stores nothing. Zero-trust throughout.

import { AiTrainingService } from './ai-training.service';

/** Test double for a TypeORM repository. */
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
    repos[32] as any, repos[33] as any, repos[34] as any, repos[35] as any,
    repos[36] as any, repos[37] as any,
  );
  return {
    svc,
    providers: repos[28] as RepoDouble<any>,
    logs: repos[33] as RepoDouble<any>,
    retention: repos[34] as RepoDouble<any>,
    capabilities: repos[35] as RepoDouble<any>,
    toolCalls: repos[36] as RepoDouble<any>,
    schemas: repos[37] as RepoDouble<any>,
  };
};

const seedProviders = async (svc: AiTrainingService, userId: string) => {
  await svc.registerGatewayProvider(userId, { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
  await svc.registerGatewayProvider(userId, { providerId: 'p-zero', costPer1kIn: 0.002, costPer1kOut: 0.004, maxTokens: 8000, retentionDays: 0 });
  await svc.registerGatewayProvider(userId, { providerId: 'p-off', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000, active: false });
};

describe('AI-053..056 gateway operations (functional lifecycle)', () => {
  it('logs are redacted before storage, fingerprint idempotent over raw content, and duplicates never double-store', async () => {
    const { svc, logs } = makeService();
    const first = await svc.recordGatewayLog('user-a', {
      providerId: 'p-cheap', modelId: 'm-v1', prompt: 'hello', response: 'world',
    });
    expect(first.fingerprint).toBe('log_5aae836e');
    expect(first.duplicate).toBe(false);
    expect(first.entry.prompt).toBe('hello');
    expect(first.entry.redactionCount).toBe(0);
    expect(logs.rows.length).toBe(1);
    const second = await svc.recordGatewayLog('user-a', {
      providerId: 'p-cheap', modelId: 'm-v1', prompt: 'hello', response: 'world',
    });
    expect(second.duplicate).toBe(true);
    expect(logs.rows.length).toBe(1);
    const secret = await svc.recordGatewayLog('user-a', {
      providerId: 'p-cheap', modelId: 'm-v1',
      prompt: 'my key sk-live-abcdef1234 and me@x.com', response: '',
    });
    expect(secret.entry.redactionCount).toBe(2);
    expect(secret.entry.prompt).toBe('my key [SECRET-KEY] and [EMAIL]');
    expect(JSON.stringify(logs.rows)).not.toContain('sk-live-abcdef1234');
    expect(JSON.stringify(logs.rows)).not.toContain('me@x.com');
    expect(logs.rows.length).toBe(2);
    // A blank log is refused by name and stores nothing.
    await expect(svc.recordGatewayLog('user-a', {
      providerId: 'p-cheap', modelId: 'm-v1', prompt: '   ', response: '',
    })).rejects.toThrow('log-empty-entry');
    expect(logs.rows.length).toBe(2);
  });

  it('retention law: zero-retention workspaces store no content, only redaction evidence, and refusals store nothing', async () => {
    const { svc, logs, retention } = makeService();
    const set = await svc.setWorkspaceRetention('user-a', { workspaceId: 'ws1', mode: 'zero' });
    expect(set.mode).toBe('zero');
    expect(set.reused).toBe(false);
    expect(retention.rows.length).toBe(1);
    const again = await svc.setWorkspaceRetention('user-a', { workspaceId: 'ws1', mode: 'zero' });
    expect(again.reused).toBe(true);
    expect(retention.rows.length).toBe(1);
    const fetched = await svc.getWorkspaceRetention('user-a', 'ws1');
    expect(fetched.mode).toBe('zero');
    expect(fetched.policy).toEqual({ mode: 'zero', persistContent: false, persistMetadata: true });
    const zero = await svc.recordGatewayLog('user-a', {
      workspaceId: 'ws1', providerId: 'p-cheap', modelId: 'm-v1',
      prompt: 'my key sk-live-abcdef1234 and me@x.com', response: '',
    });
    expect(zero.entry.prompt).toBe('');
    expect(zero.entry.response).toBe('');
    expect(zero.entry.contentOmitted).toBe(true);
    expect(zero.entry.redactionCount).toBe(2);
    expect(JSON.stringify(logs.rows)).not.toContain('sk-live-abcdef1234');
    // An unknown mode is refused by name and stores nothing.
    await expect(svc.setWorkspaceRetention('user-a', { workspaceId: 'ws2', mode: 'strict' } as any))
      .rejects.toThrow('retention-unknown-mode:strict');
    expect(retention.rows.length).toBe(1);
    await expect(svc.getWorkspaceRetention('user-a', 'ws2'))
      .rejects.toThrow('retention-policy-not-found:ws2');
  });

  it('zero-retention routing only ever reaches providers that retain nothing, and standard workspaces keep the cheapest chain', async () => {
    const { svc } = makeService();
    await seedProviders(svc, 'user-a');
    await svc.setWorkspaceRetention('user-a', { workspaceId: 'ws1', mode: 'zero' });
    const zeroRoute = await svc.routeWorkspaceRequest('user-a', {
      workspaceId: 'ws1', promptTokens: 1000, outputTokens: 500,
    });
    expect(zeroRoute).toEqual({
      primaryId: 'p-zero',
      chain: ['p-zero'],
      estimatedCostUsd: 0.004,
      providersExcluded: ['p-off', 'p-cheap'],
    });
    const standardRoute = await svc.routeWorkspaceRequest('user-a', {
      workspaceId: 'ws-none', promptTokens: 1000, outputTokens: 500,
    });
    expect(standardRoute.primaryId).toBe('p-cheap');
    expect(standardRoute.chain).toEqual(['p-cheap', 'p-zero']);
    expect(standardRoute.estimatedCostUsd).toBe(0.002);
    // A workspace with zero retention and no capable zero provider
    // is refused by name, never silently downgraded.
    const only = makeService();
    await only.svc.registerGatewayProvider('user-a', { providerId: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8000 });
    await only.svc.setWorkspaceRetention('user-a', { workspaceId: 'ws1', mode: 'zero' });
    await expect(only.svc.routeWorkspaceRequest('user-a', {
      workspaceId: 'ws1', promptTokens: 100, outputTokens: 50,
    })).rejects.toThrow('retention-no-zero-retention-providers');
  });

  it('capability registry: registration is idempotent per model and matching routes to the cheapest capable active model', async () => {
    const { svc, capabilities } = makeService();
    const reg = await svc.registerCapability('user-a', {
      modelId: 'm-code', capabilities: ['tools', 'code'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true,
    });
    expect(reg.fingerprint).toBe('cap_91096277');
    expect(reg.duplicate).toBe(false);
    expect(reg.matrix.capabilities).toEqual(['code', 'tools']);
    expect(capabilities.rows.length).toBe(1);
    const dup = await svc.registerCapability('user-a', {
      modelId: 'm-code', capabilities: ['code', 'tools'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true,
    });
    expect(dup.duplicate).toBe(true);
    expect(capabilities.rows.length).toBe(1);
    await svc.registerCapability('user-a', {
      modelId: 'm-omni', capabilities: ['code', 'vision', 'audio', 'tools'], maxContextTokens: 32000,
      costPer1kIn: 0.01, costPer1kOut: 0.05, active: true,
    });
    const match = await svc.matchModelCapabilities('user-a', {
      required: ['code', 'tools'], promptTokens: 1000, outputTokens: 500,
    });
    expect(match.primaryId).toBe('m-code');
    expect(match.chain).toEqual(['m-code', 'm-omni']);
    await expect(svc.matchModelCapabilities('user-a', {
      required: ['vision'], promptTokens: 100, outputTokens: 50,
    })).rejects.toThrow('capability-no-model-supports:vision');
    // Unknown capability names are refused and store nothing.
    await expect(svc.registerCapability('user-a', {
      modelId: 'm-bad', capabilities: ['smell'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true,
    })).rejects.toThrow('capability-unknown:smell');
    expect(capabilities.rows.length).toBe(2);
  });

  it('tool calls normalize to one shape, ignore argument key order, and unknown providers are refused by name', async () => {
    const { svc, toolCalls } = makeService();
    const a = await svc.recordToolCall('user-a', {
      providerId: 'openai', name: 'get_weather', argumentsJson: JSON.stringify({ city: 'lagos', unit: 'c' }),
    });
    expect(a.fingerprint).toBe('tc_81603f96');
    expect(a.duplicate).toBe(false);
    expect(a.call.args).toEqual({ city: 'lagos', unit: 'c' });
    expect(toolCalls.rows.length).toBe(1);
    const permuted = await svc.recordToolCall('user-a', {
      providerId: 'openai', name: 'get_weather', argumentsJson: JSON.stringify({ unit: 'c', city: 'lagos' }),
    });
    expect(permuted.duplicate).toBe(true);
    expect(toolCalls.rows.length).toBe(1);
    const b = await svc.recordToolCall('user-a', {
      providerId: 'anthropic', name: 'get_weather', args: { unit: 'c', city: 'lagos' },
    });
    expect(b.fingerprint).toBe('tc_4b3829e2');
    expect(toolCalls.rows.length).toBe(2);
    await expect(svc.recordToolCall('user-a', {
      providerId: 'bedrock', name: 'get_weather', argumentsJson: '{}',
    })).rejects.toThrow('toolcall-unknown-provider:bedrock');
    await expect(svc.recordToolCall('user-a', {
      providerId: 'openai', name: 'get_weather', argumentsJson: '{bad json',
    })).rejects.toThrow('toolcall-invalid-arguments');
    expect(toolCalls.rows.length).toBe(2);
  });

  it('output schemas are idempotent per id and validation names the exact failing field', async () => {
    const { svc, schemas } = makeService();
    const reg = await svc.registerOutputSchema('user-a', {
      schemaId: 'weather-output',
      fields: [
        { name: 'summary', type: 'string', required: true },
        { name: 'confidence', type: 'number', required: true },
        { name: 'verdict', type: 'string', required: true, enumValues: ['pass', 'fail'] },
      ],
    });
    expect(reg.fingerprint).toBe('os_60d0eeb2');
    expect(reg.reused).toBe(false);
    expect(schemas.rows.length).toBe(1);
    const dup = await svc.registerOutputSchema('user-a', {
      schemaId: 'weather-output',
      fields: [
        { name: 'verdict', type: 'string', required: true, enumValues: ['pass', 'fail'] },
        { name: 'confidence', type: 'number', required: true },
        { name: 'summary', type: 'string', required: true },
      ],
    });
    expect(dup.reused).toBe(true);
    expect(schemas.rows.length).toBe(1);
    const ok = await svc.validateOutputAgainstSchema('user-a', {
      schemaId: 'weather-output',
      output: { summary: 'fine', confidence: 0.9, verdict: 'pass' },
    });
    expect(ok).toEqual({ fieldsChecked: 3 });
    await expect(svc.validateOutputAgainstSchema('user-a', {
      schemaId: 'weather-output',
      output: { summary: 'fine', confidence: 'high', verdict: 'pass' },
    })).rejects.toThrow('output-wrong-type:confidence:number');
    await expect(svc.validateOutputAgainstSchema('user-a', {
      schemaId: 'weather-output',
      output: { summary: 'fine', verdict: 'pass' },
    })).rejects.toThrow('output-missing-field:confidence');
    await expect(svc.validateOutputAgainstSchema('user-a', {
      schemaId: 'weather-output',
      output: { summary: 'fine', confidence: 1, verdict: 'maybe' },
    })).rejects.toThrow('output-not-enum:verdict:maybe');
    await expect(svc.validateOutputAgainstSchema('user-a', {
      schemaId: 'nope', output: {},
    })).rejects.toThrow('output-schema-not-found:nope');
  });
});

describe('AI-053..056 zero trust (adversarial)', () => {
  it('another user logs, policies, matrices, tool calls and schemas are invisible and refusals never leak rows', async () => {
    const { svc, logs, retention, capabilities, toolCalls, schemas } = makeService();
    await seedProviders(svc, 'user-a');
    await svc.setWorkspaceRetention('user-a', { workspaceId: 'ws1', mode: 'zero' });
    await svc.recordGatewayLog('user-a', {
      workspaceId: 'ws1', providerId: 'p-zero', modelId: 'm-v1', prompt: 'secret stuff', response: '',
    });
    await svc.registerCapability('user-a', {
      modelId: 'm-code', capabilities: ['code'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true,
    });
    await svc.recordToolCall('user-a', {
      providerId: 'openai', name: 't', args: { x: 1 },
    });
    await svc.registerOutputSchema('user-a', {
      schemaId: 's1', fields: [{ name: 'f', type: 'string', required: true }],
    });
    expect((await svc.listGatewayLogs('user-b')).length).toBe(0);
    await expect(svc.getWorkspaceRetention('user-b', 'ws1'))
      .rejects.toThrow('retention-policy-not-found:ws1');
    // user-b has its own providers seeded with its own retention truth;
    // user-a zero-retention providers never route for user-b.
    const zeroForB = await svc.routeWorkspaceRequest('user-b', {
      workspaceId: 'ws1', promptTokens: 100, outputTokens: 50,
    });
    expect(zeroForB.primaryId).toBe('p-zero');
    expect((await svc.listCapabilityMatrices('user-b')).length).toBe(0);
    await expect(svc.matchModelCapabilities('user-b', {
      required: ['code'], promptTokens: 10, outputTokens: 10,
    })).rejects.toThrow('capability-no-models');
    expect((await svc.listToolCalls('user-b')).length).toBe(0);
    expect((await svc.listOutputSchemas('user-b')).length).toBe(0);
    await expect(svc.validateOutputAgainstSchema('user-b', {
      schemaId: 's1', output: { f: 'x' },
    })).rejects.toThrow('output-schema-not-found:s1');
    // user-a truth is untouched by every user-b refusal.
    expect(logs.rows.length).toBe(1);
    expect(retention.rows.length).toBe(1);
    expect(capabilities.rows.length).toBe(1);
    expect(toolCalls.rows.length).toBe(1);
    expect(schemas.rows.length).toBe(1);
    expect((logs.rows[0] as any).userId).toBe('user-a');
  });
});
