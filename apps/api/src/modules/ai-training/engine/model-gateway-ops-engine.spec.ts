// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/model-gateway-ops-engine.spec.ts
// ============================================================================
// ENGINE tests for gateway operations (FORGE AI-053..056). Pinned
// hand-computed vectors pin the math; 4x500-case mulberry32(42) sweeps pin
// the invariants (redaction honesty, capability routing, zero-retention
// routing, tool-call and structured-output contracts); order-independence
// tests pin determinism. No apostrophes inside single-quoted titles.

import {
  redactGatewayLog,
  admitGatewayLog,
  planLogRetention,
  planZeroRetentionRoute,
  registerCapabilityMatrix,
  matchModelCapabilities,
  normalizeToolCall,
  registerOutputSchema,
  validateStructuredOutput,
  CAPABILITY_KINDS,
  CapabilityMatrixValue,
  OutputFieldSpec,
} from './model-gateway-ops-engine';

interface RetProvider {
  id: string;
  costPer1kIn: number;
  costPer1kOut: number;
  maxTokens: number;
  active: boolean;
  retentionDays?: number;
}

const RET_PROVIDERS: RetProvider[] = [
  { id: 'p-zero', costPer1kIn: 0.002, costPer1kOut: 0.004, maxTokens: 8192, active: true, retentionDays: 0 },
  { id: 'p-cheap', costPer1kIn: 0.001, costPer1kOut: 0.002, maxTokens: 8192, active: true, retentionDays: 30 },
  { id: 'p-hold', costPer1kIn: 0.0005, costPer1kOut: 0.001, maxTokens: 8192, active: true, retentionDays: 0 },
  { id: 'p-off', costPer1kIn: 0.001, costPer1kOut: 0.001, maxTokens: 8192, active: false, retentionDays: 90 },
  { id: 'p-unset', costPer1kIn: 0.0001, costPer1kOut: 0.0002, maxTokens: 8192, active: true },
];

const MATRICES: CapabilityMatrixValue[] = [
  { modelId: 'm-code', capabilities: ['code', 'tools'], maxContextTokens: 8192, costPer1kIn: 0.001, costPer1kOut: 0.002, active: true, fingerprint: 'cap_91096277' },
  { modelId: 'm-omni', capabilities: ['code', 'vision', 'audio', 'tools'], maxContextTokens: 32000, costPer1kIn: 0.01, costPer1kOut: 0.05, active: true, fingerprint: 'cap_e1cae6b5' },
  { modelId: 'm-text', capabilities: ['code'], maxContextTokens: 4096, costPer1kIn: 0.0005, costPer1kOut: 0.001, active: true, fingerprint: 'cap_x1' },
  { modelId: 'm-off', capabilities: ['code', 'tools'], maxContextTokens: 8192, costPer1kIn: 0.0001, costPer1kOut: 0.0001, active: false, fingerprint: 'cap_x2' },
];

const SCHEMA: OutputFieldSpec[] = [
  { name: 'summary', type: 'string', required: true },
  { name: 'confidence', type: 'number', required: true },
  { name: 'verdict', type: 'string', required: true, enumValues: ['pass', 'fail'] },
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

describe('model gateway ops engine vectors (AI-053..056)', () => {
  it('redaction destroys secrets before storage and reports honest counts', () => {
    const v = redactGatewayLog({
      prompt: 'Contact me at jane.doe@example.com or use key sk-live-abcdef1234 for auth. My line is +234 801 234 5678.',
      response: 'Authorized with Bearer eyJhbGciOiJIUzI1 and copy ada@forge.dev',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.prompt).toBe('Contact me at [EMAIL] or use key [SECRET-KEY] for auth. My line is [PHONE].');
    expect(v.value.response).toBe('Authorized with [TOKEN] and copy [EMAIL]');
    expect(v.value.redactionCount).toBe(5);
    expect(v.value.findings).toEqual([
      { kind: 'secret-key', count: 1 },
      { kind: 'email', count: 1 },
      { kind: 'phone', count: 1 },
      { kind: 'token', count: 1 },
      { kind: 'email', count: 1 },
    ]);
    expect(redactGatewayLog({ prompt: '   ', response: '' }))
      .toMatchObject({ ok: false, reason: 'log-empty-entry' });
  });

  it('log admission is idempotent, capped loudly, and zero-retention stores no content', () => {
    const v1 = admitGatewayLog({
      providerId: 'p-cheap', modelId: 'm-v1', prompt: 'hello', response: 'world', now: 1000, entries: [],
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    expect(v1.value.admitted.id).toBe('log_5aae836e');
    expect(v1.value.admitted.contentOmitted).toBe(false);
    expect(v1.value.duplicate).toBe(false);
    const v2 = admitGatewayLog({
      providerId: 'p-cheap', modelId: 'm-v1', prompt: 'hello', response: 'world', now: 2000,
      entries: [v1.value.admitted],
    });
    expect(v2.ok).toBe(true);
    if (v2.ok) {
      expect(v2.value.duplicate).toBe(true);
      expect(v2.value.admitted.loggedAt).toBe(1000);
    }
    expect(admitGatewayLog({
      providerId: 'p-cheap', modelId: 'm-v1', prompt: 'a', response: 'b', now: 3000,
      maxEntries: 1, entries: [v1.value.admitted],
    })).toMatchObject({ ok: false, reason: 'log-over-cap:1' });
    const v4 = admitGatewayLog({
      providerId: 'p-cheap', modelId: 'm-v1',
      prompt: 'my key sk-live-abcdef1234 and me@x.com', response: '',
      now: 4000, persistContent: false, entries: [],
    });
    expect(v4.ok).toBe(true);
    if (v4.ok) {
      expect(v4.value.admitted.id).toBe('log_f0849fb2');
      expect(v4.value.admitted.prompt).toBe('');
      expect(v4.value.admitted.response).toBe('');
      expect(v4.value.admitted.redactionCount).toBe(2);
      expect(v4.value.admitted.findings).toEqual([
        { kind: 'secret-key', count: 1 },
        { kind: 'email', count: 1 },
      ]);
      expect(v4.value.admitted.contentOmitted).toBe(true);
    }
    expect(admitGatewayLog({ providerId: '', modelId: 'm', prompt: 'x', response: 'y', now: 1, entries: [] }))
      .toMatchObject({ ok: false, reason: 'log-no-provider' });
  });

  it('retention law: modes are named and zero-retention routes only to providers that retain nothing', () => {
    expect(planLogRetention({ workspaceRetentionMode: 'zero' })).toEqual({
      ok: true, value: { mode: 'zero', persistContent: false, persistMetadata: true },
    });
    expect(planLogRetention({ workspaceRetentionMode: 'standard' })).toEqual({
      ok: true, value: { mode: 'standard', persistContent: true, persistMetadata: true },
    });
    expect(planLogRetention({ workspaceRetentionMode: 'high' }))
      .toMatchObject({ ok: false, reason: 'retention-unknown-mode:high' });
    const v1 = planZeroRetentionRoute({
      providers: RET_PROVIDERS, workspaceRetentionMode: 'zero', promptTokens: 1000, outputTokens: 500,
    });
    expect(v1.ok).toBe(true);
    if (v1.ok) {
      expect(v1.value).toEqual({
        primaryId: 'p-hold',
        chain: ['p-hold', 'p-zero'],
        estimatedCostUsd: 0.001,
        providersExcluded: ['p-off', 'p-cheap', 'p-unset'],
      });
    }
    const v2 = planZeroRetentionRoute({
      providers: RET_PROVIDERS, workspaceRetentionMode: 'standard', promptTokens: 1000, outputTokens: 500,
    });
    expect(v2.ok).toBe(true);
    if (v2.ok) {
      expect(v2.value).toEqual({
        primaryId: 'p-unset',
        chain: ['p-unset', 'p-hold', 'p-cheap', 'p-zero'],
        estimatedCostUsd: 0.0002,
        providersExcluded: ['p-off'],
      });
    }
    expect(planZeroRetentionRoute({
      providers: [RET_PROVIDERS[4]], workspaceRetentionMode: 'zero', promptTokens: 100, outputTokens: 100,
    })).toMatchObject({ ok: false, reason: 'retention-no-zero-retention-providers' });
    expect(planZeroRetentionRoute({
      providers: RET_PROVIDERS, workspaceRetentionMode: 'strict', promptTokens: 100, outputTokens: 100,
    })).toMatchObject({ ok: false, reason: 'retention-unknown-mode:strict' });
    const v5 = planZeroRetentionRoute({
      providers: RET_PROVIDERS, workspaceRetentionMode: 'zero', promptTokens: 4000, outputTokens: 500,
    });
    expect(v5.ok).toBe(true);
    if (v5.ok) {
      expect(v5.value.primaryId).toBe('p-hold');
      expect(v5.value.estimatedCostUsd).toBe(0.0025);
    }
  });

  it('capability registry: registration is fingerprint idempotent and unknown capabilities are refused', () => {
    const v = registerCapabilityMatrix({
      modelId: 'm-code', capabilities: ['tools', 'code'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true, existing: [],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.fingerprint).toBe('cap_91096277');
    expect(v.value.matrix.capabilities).toEqual(['code', 'tools']);
    expect(v.value.duplicate).toBe(false);
    const dup = registerCapabilityMatrix({
      modelId: 'm-code', capabilities: ['code', 'tools'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true, existing: [v.value.matrix],
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.value.duplicate).toBe(true);
      expect(dup.value.fingerprint).toBe('cap_91096277');
    }
    expect(registerCapabilityMatrix({
      modelId: 'm-x', capabilities: ['smell'], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true, existing: [],
    })).toMatchObject({ ok: false, reason: 'capability-unknown:smell' });
    expect(registerCapabilityMatrix({
      modelId: 'm-x', capabilities: [], maxContextTokens: 8192,
      costPer1kIn: 0.001, costPer1kOut: 0.002, active: true, existing: [],
    })).toMatchObject({ ok: false, reason: 'capability-empty' });
  });

  it('capability matching routes to the cheapest capable active model and refuses by name', () => {
    const v1 = matchModelCapabilities({
      required: ['code', 'tools'], models: MATRICES, promptTokens: 1000, outputTokens: 500,
    });
    expect(v1.ok).toBe(true);
    if (v1.ok) {
      expect(v1.value.primaryId).toBe('m-code');
      expect(v1.value.chain).toEqual(['m-code', 'm-omni']);
    }
    expect(matchModelCapabilities({
      required: ['vision'], models: [MATRICES[0], MATRICES[2]], promptTokens: 100, outputTokens: 100,
    })).toMatchObject({ ok: false, reason: 'capability-no-model-supports:vision' });
    const v3 = matchModelCapabilities({
      required: ['code'], models: MATRICES, promptTokens: 4000, outputTokens: 500,
    });
    expect(v3.ok).toBe(true);
    if (v3.ok) expect(v3.value.chain).toEqual(['m-code', 'm-omni']);
    expect(matchModelCapabilities({
      required: ['bogus'], models: MATRICES, promptTokens: 1, outputTokens: 1,
    })).toMatchObject({ ok: false, reason: 'capability-unknown:bogus' });
    expect(matchModelCapabilities({
      required: ['code'], models: [], promptTokens: 1, outputTokens: 1,
    })).toMatchObject({ ok: false, reason: 'capability-no-models' });
  });

  it('tool calls normalize to one shape and the fingerprint ignores argument key order', () => {
    const a = normalizeToolCall({
      providerId: 'openai', name: 'get_weather', argumentsJson: JSON.stringify({ city: 'lagos', unit: 'c' }),
    });
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.value.fingerprint).toBe('tc_81603f96');
      expect(a.value.args).toEqual({ city: 'lagos', unit: 'c' });
    }
    const b = normalizeToolCall({
      providerId: 'anthropic', name: 'get_weather', args: { unit: 'c', city: 'lagos' },
    });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value.fingerprint).toBe('tc_4b3829e2');
    const perm = normalizeToolCall({
      providerId: 'openai', name: 'get_weather', argumentsJson: JSON.stringify({ unit: 'c', city: 'lagos' }),
    });
    expect(perm.ok).toBe(true);
    if (perm.ok && a.ok) expect(perm.value.fingerprint).toBe(a.value.fingerprint);
    expect(normalizeToolCall({ providerId: 'bedrock', name: 'x', argumentsJson: '{}' }))
      .toMatchObject({ ok: false, reason: 'toolcall-unknown-provider:bedrock' });
    expect(normalizeToolCall({ providerId: 'openai', name: 'x', argumentsJson: '{bad json' }))
      .toMatchObject({ ok: false, reason: 'toolcall-invalid-arguments' });
    expect(normalizeToolCall({ providerId: 'openai' }))
      .toMatchObject({ ok: false, reason: 'toolcall-missing-name' });
    expect(normalizeToolCall({ providerId: 'anthropic', name: 'x' }))
      .toMatchObject({ ok: false, reason: 'toolcall-missing-arguments' });
  });

  it('output schemas are fingerprint idempotent and validation names the exact field', () => {
    const s = registerOutputSchema({ schemaId: 'weather-output', fields: SCHEMA, existing: [] });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.value.fingerprint).toBe('os_60d0eeb2');
    expect(s.value.duplicate).toBe(false);
    const dup = registerOutputSchema({
      schemaId: 'weather-output', fields: SCHEMA.slice().reverse(), existing: [s.value.schema],
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.value.duplicate).toBe(true);
      expect(dup.value.fingerprint).toBe('os_60d0eeb2');
    }
    const ok = validateStructuredOutput({
      fields: SCHEMA, output: { summary: 'ok', confidence: 0.9, verdict: 'pass' },
    });
    expect(ok).toEqual({ ok: true, value: { fieldsChecked: 3 } });
    expect(validateStructuredOutput({
      fields: SCHEMA, output: { summary: 'ok', confidence: 'high', verdict: 'pass' },
    })).toMatchObject({ ok: false, reason: 'output-wrong-type:confidence:number' });
    expect(validateStructuredOutput({
      fields: SCHEMA, output: { summary: 'ok', verdict: 'pass' },
    })).toMatchObject({ ok: false, reason: 'output-missing-field:confidence' });
    expect(validateStructuredOutput({
      fields: SCHEMA, output: { summary: 'ok', confidence: 1, verdict: 'maybe' },
    })).toMatchObject({ ok: false, reason: 'output-not-enum:verdict:maybe' });
    expect(validateStructuredOutput({ fields: SCHEMA, output: 'nope' }))
      .toMatchObject({ ok: false, reason: 'output-not-object' });
    expect(registerOutputSchema({ schemaId: '', fields: SCHEMA, existing: [] }))
      .toMatchObject({ ok: false, reason: 'schema-no-id' });
    expect(registerOutputSchema({ schemaId: 'x', fields: [], existing: [] }))
      .toMatchObject({ ok: false, reason: 'schema-no-fields' });
  });
});

describe('model gateway ops engine order independence', () => {
  it('redaction findings, matching, routing and fingerprints ignore input order', () => {
    for (const order of orderings(RET_PROVIDERS)) {
      const v = planZeroRetentionRoute({
        providers: order, workspaceRetentionMode: 'zero', promptTokens: 1000, outputTokens: 500,
      });
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      expect(v.value.primaryId).toBe('p-hold');
      expect(v.value.chain).toEqual(['p-hold', 'p-zero']);
    }
    for (const order of orderings(MATRICES)) {
      const v = matchModelCapabilities({
        required: ['code', 'tools'], models: order, promptTokens: 1000, outputTokens: 500,
      });
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      expect(v.value.primaryId).toBe('m-code');
      expect(v.value.chain).toEqual(['m-code', 'm-omni']);
    }
    const first = admitGatewayLog({
      providerId: 'p-cheap', modelId: 'm-v1', prompt: 'hello', response: 'world', now: 1000, entries: [],
    });
    if (first.ok) {
      const other = admitGatewayLog({
        providerId: 'p-cheap', modelId: 'm-v2', prompt: 'x', response: 'y', now: 1500, entries: [],
      });
      expect(other.ok).toBe(true);
      if (other.ok) {
        for (const order of orderings([first.value.admitted, other.value.admitted])) {
          const dup = admitGatewayLog({
            providerId: 'p-cheap', modelId: 'm-v1', prompt: 'hello', response: 'world', now: 9999,
            entries: order,
          });
          expect(dup.ok).toBe(true);
          if (dup.ok) {
            expect(dup.value.duplicate).toBe(true);
            expect(dup.value.admitted.id).toBe('log_5aae836e');
          }
        }
      }
    }
    const viaJson = normalizeToolCall({
      providerId: 'generic', name: 't', args: { a: 1, b: 'x', c: [1, 2] },
    });
    const viaJsonPerm = normalizeToolCall({
      providerId: 'generic', name: 't', args: { c: [1, 2], b: 'x', a: 1 },
    });
    expect(viaJson.ok).toBe(true);
    expect(viaJsonPerm.ok).toBe(true);
    if (viaJson.ok && viaJsonPerm.ok) {
      expect(viaJsonPerm.value.fingerprint).toBe(viaJson.value.fingerprint);
    }
  });
});

describe('model gateway ops engine 500-case sweeps (mulberry32 seed 42)', () => {
  it('sweep A: every placed secret is destroyed and counted exactly', () => {
    const rand = mulberry32(42);
    const emails = ['a@x.com', 'b.c@d-e.org', 'user+tag@forge.dev'];
    const keys = ['sk-live-abcdef1234', 'sk-proj-9x8y7z6w5v4u', 'sk-test-qq11ww22ee33'];
    const phones = ['+234 801 234 5678', '+1 555 123 4567', '+44 20 7946 0018'];
    const junk = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    for (let i = 0; i < 500; i++) {
      const placed: string[] = [];
      const segments: string[] = [];
      const n = Math.floor(rand() * 6);
      for (let k = 0; k < n; k++) {
        segments.push(junk[Math.floor(rand() * junk.length)]);
        const kind = Math.floor(rand() * 4);
        const secret =
          kind === 0 ? emails[Math.floor(rand() * emails.length)]
            : kind === 1 ? keys[Math.floor(rand() * keys.length)]
              : kind === 2 ? phones[Math.floor(rand() * phones.length)]
                : 'Bearer ' + 'tok' + Math.floor(rand() * 100000000) + 'abcd';
        placed.push(secret);
        segments.push(secret);
      }
      const prompt = segments.join(' ');
      const v = redactGatewayLog({ prompt, response: '' });
      // An empty prompt with an empty response is refused by name; the sweep
      // honors the refusal instead of blindly asserting ok.
      if (prompt.trim().length === 0) {
        expect(v).toMatchObject({ ok: false, reason: 'log-empty-entry' });
        continue;
      }
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      expect(v.value.redactionCount).toBe(placed.length);
      const out = v.value.prompt;
      for (const s of placed) {
        expect(out).not.toContain(s);
      }
      if (placed.some((s) => s.includes('@'))) {
        expect(out).not.toContain('@');
      }
      if (placed.some((s) => s.startsWith('sk-'))) {
        expect(out).not.toContain('sk-');
      }
    }
  });

  it('sweep B: capability matching always picks the manual cheapest capable active model', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 4);
      const models: CapabilityMatrixValue[] = [];
      for (let j = 0; j < n; j++) {
        const caps: string[] = [];
        for (const c of CAPABILITY_KINDS) {
          if (rand() > 0.5) caps.push(c);
        }
        models.push({
          modelId: 'm-' + j,
          capabilities: caps,
          maxContextTokens: [512, 2048, 8192, 32000][Math.floor(rand() * 4)],
          costPer1kIn: round6(rand() * 0.02),
          costPer1kOut: round6(rand() * 0.05),
          active: rand() > 0.25,
          fingerprint: 'f' + i + '-' + j,
        });
      }
      const required: string[] = [];
      for (const c of CAPABILITY_KINDS) {
        if (rand() > 0.6) required.push(c);
      }
      const pt = Math.floor(rand() * 2000) + 1;
      const ot = Math.floor(rand() * 1000) + 1;
      const v = matchModelCapabilities({ required, models, promptTokens: pt, outputTokens: ot });
      const active = models.filter((m) => m.active);
      const unsupported = required.find((c) => !active.some((m) => m.capabilities.includes(c)));
      if (unsupported !== undefined) {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe('capability-no-model-supports:' + unsupported);
        continue;
      }
      const need = pt + ot;
      const manual = active
        .filter((m) => required.every((c) => m.capabilities.includes(c)))
        .filter((m) => m.maxContextTokens >= need)
        .sort((a, b) =>
          a.costPer1kOut !== b.costPer1kOut
            ? a.costPer1kOut - b.costPer1kOut
            : a.modelId < b.modelId ? -1 : 1,
        );
      if (manual.length === 0) {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe('capability-no-capable-model:' + need);
      } else {
        expect(v.ok).toBe(true);
        if (v.ok) {
          expect(v.value.primaryId).toBe(manual[0].modelId);
          expect(v.value.chain).toEqual(manual.map((m) => m.modelId));
        }
      }
    }
  });

  it('sweep C: retention routing matches the manual exclusion and ranking exactly', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 4);
      const providers: RetProvider[] = [];
      for (let j = 0; j < n; j++) {
        providers.push({
          id: 'p-' + j,
          costPer1kIn: round6(rand() * 0.02),
          costPer1kOut: round6(rand() * 0.05),
          maxTokens: [512, 2048, 8192, 32000][Math.floor(rand() * 4)],
          active: rand() > 0.2,
          retentionDays: [0, 0, 1, 30, 365][Math.floor(rand() * 5)],
        });
      }
      const mode = rand() > 0.5 ? 'zero' : 'standard';
      const pt = Math.floor(rand() * 2000) + 1;
      const ot = Math.floor(rand() * 1000) + 1;
      const v = planZeroRetentionRoute({
        providers, workspaceRetentionMode: mode, promptTokens: pt, outputTokens: ot,
      });
      const excluded: string[] = providers.filter((p) => !p.active).map((p) => p.id);
      let eligible = providers.filter((p) => p.active);
      if (mode === 'zero') {
        eligible = eligible.filter((p) => (p.retentionDays ?? 30) === 0);
        for (const p of providers.filter((p) => p.active)) {
          if ((p.retentionDays ?? 30) !== 0) excluded.push(p.id);
        }
        if (eligible.length === 0) {
          expect(v.ok).toBe(false);
          if (!v.ok) expect(v.reason).toBe('retention-no-zero-retention-providers');
          continue;
        }
      }
      const need = pt + ot;
      const capable = eligible.filter((p) => p.maxTokens >= need);
      if (capable.length === 0) {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe('retention-no-capable-provider:' + need);
        continue;
      }
      const ranked = capable.slice().sort((a, b) =>
        a.costPer1kOut !== b.costPer1kOut
          ? a.costPer1kOut - b.costPer1kOut
          : a.id < b.id ? -1 : 1,
      );
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      expect(v.value.primaryId).toBe(ranked[0].id);
      expect(v.value.chain).toEqual(ranked.map((p) => p.id));
      expect(v.value.estimatedCostUsd).toBe(round6((pt / 1000) * ranked[0].costPer1kIn + (ot / 1000) * ranked[0].costPer1kOut));
      expect(v.value.providersExcluded).toEqual(excluded);
    }
  });

  it('sweep D: tool fingerprints ignore key order and output validation matches the manual mirror', () => {
    const rand = mulberry32(42);
    const types = ['string', 'number', 'boolean', 'array', 'object'];
    for (let i = 0; i < 500; i++) {
      const args: Record<string, unknown> = {};
      const count = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        const pick = Math.floor(rand() * 4);
        args['k' + k] = pick === 0 ? 'v' + Math.floor(rand() * 100)
          : pick === 1 ? Math.floor(rand() * 100)
            : pick === 2 ? rand() > 0.5
              : ['x', 'y'];
      }
      const keys = Object.keys(args);
      const shuffledKeys: string[] = [];
      const pool = keys.slice();
      while (pool.length > 0) {
        shuffledKeys.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      }
      const shuffled: Record<string, unknown> = {};
      for (const k of shuffledKeys) shuffled[k] = args[k];
      const a = normalizeToolCall({ providerId: 'openai', name: 't', argumentsJson: JSON.stringify(args) });
      const b = normalizeToolCall({ providerId: 'openai', name: 't', argumentsJson: JSON.stringify(shuffled) });
      const c = normalizeToolCall({ providerId: 'generic', name: 't', args: shuffled });
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(c.ok).toBe(true);
      if (a.ok && b.ok) expect(b.value.fingerprint).toBe(a.value.fingerprint);
      if (a.ok && c.ok) expect(c.value.fingerprint).not.toBe(a.value.fingerprint);

      const n = 1 + Math.floor(rand() * 4);
      const fields: OutputFieldSpec[] = [];
      for (let f = 0; f < n; f++) {
        const type = types[Math.floor(rand() * types.length)];
        fields.push({
          name: 'f' + f,
          type: type as OutputFieldSpec['type'],
          required: rand() > 0.2,
          ...(type === 'string' && rand() > 0.7 ? { enumValues: ['a', 'b'] } : {}),
        });
      }
      const output: Record<string, unknown> = {};
      for (const f of fields) {
        if (rand() > 0.9) continue;
        if (f.type === 'string') {
          output[f.name] = f.enumValues && rand() > 0.2 ? 'a' : rand() > 0.15 ? 'txt' : 7;
        } else if (f.type === 'number') {
          output[f.name] = rand() > 0.15 ? Math.floor(rand() * 10) : 'x';
        } else if (f.type === 'boolean') {
          output[f.name] = rand() > 0.15 ? true : 'x';
        } else if (f.type === 'array') {
          output[f.name] = rand() > 0.15 ? [1, 2] : 'x';
        } else {
          output[f.name] = rand() > 0.15 ? { z: 1 } : 'x';
        }
      }
      const v = validateStructuredOutput({ fields, output });
      // The engine walks the fields in declaration order and reports the
      // first failure it meets: missing, then type, then enum, per field.
      let expected: { ok: boolean; reason?: string } = { ok: true };
      for (const f of fields) {
        const val = output[f.name];
        if (val === undefined) {
          if (f.required !== false) {
            expected = { ok: false, reason: 'output-missing-field:' + f.name };
            break;
          }
          continue;
        }
        const t = typeof val;
        if (f.type === 'array' && !Array.isArray(val)) { expected = { ok: false, reason: 'output-wrong-type:' + f.name + ':array' }; break; }
        if (f.type === 'object' && (t !== 'object' || Array.isArray(val))) { expected = { ok: false, reason: 'output-wrong-type:' + f.name + ':object' }; break; }
        if (f.type !== 'array' && f.type !== 'object' && t !== f.type) { expected = { ok: false, reason: 'output-wrong-type:' + f.name + ':' + f.type }; break; }
        if (f.enumValues && f.enumValues.length > 0 && !f.enumValues.includes(val as string)) { expected = { ok: false, reason: 'output-not-enum:' + f.name + ':' + String(val) }; break; }
      }
      if (expected.ok) {
        expect(v.ok).toBe(true);
      } else {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe(expected.reason);
      }
    }
  });
});