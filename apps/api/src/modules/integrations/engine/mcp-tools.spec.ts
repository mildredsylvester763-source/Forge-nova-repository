// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/mcp-tools.spec.ts
// ============================================================================

import { MCP_TOOLS, resolveTool, validateToolArgs } from './mcp-tools';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('mcp-tools engine', () => {
  it('exposes the pinned 7-tool MCP surface', () => {
    expect(MCP_TOOLS).toHaveLength(7);
    expect(MCP_TOOLS.map((t) => t.name)).toContain('draft_invoice');
    expect(MCP_TOOLS.map((t) => t.name)).toContain('compute_vat');
  });

  it('resolves tools and refuses unknown ones by name', () => {
    const r = resolveTool('compute_vat');
    if (r.ok) expect(r.value.requiredArgs).toHaveLength(3);
    const u = resolveTool('nope');
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.reason).toBe('mcp-unknown-tool:nope');
  });

  it('accepts a valid vat call and a no-arg tool', () => {
    const r = validateToolArgs('compute_vat', { amountCents: 100000, rateBps: 750, mode: 'exclusive' });
    if (r.ok) expect(r.value.amountCents).toBe(100000);
    const bare = validateToolArgs('weekly_report', {});
    expect(bare.ok).toBe(true);
  });

  it('refuses missing, mistyped, and unknown args by name', () => {
    const missing = validateToolArgs('compute_vat', { amountCents: 100000, rateBps: 750 });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('mcp-missing-arg:mode');
    const typed = validateToolArgs('compute_vat', { amountCents: '100000', rateBps: 750, mode: 'exclusive' });
    expect(typed.ok).toBe(false);
    if (!typed.ok) expect(typed.reason).toBe('mcp-invalid-arg:amountCents');
    const unknown = validateToolArgs('search', { query: 'x', extra: 1 });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('mcp-unknown-arg:extra');
  });

  it('500-case sweep: cleaned verdicts always carry every required arg', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const t = MCP_TOOLS[Math.floor(rnd() * MCP_TOOLS.length)];
      const args: Record<string, unknown> = {};
      for (const f of t.requiredArgs) {
        if (rnd() < 0.9) args[f] = t.argTypes[f] === 'number' ? Math.floor(rnd() * 1000) : 'str_' + Math.floor(rnd() * 100);
      }
      const v = validateToolArgs(t.name, args);
      if (!v.ok) {
        expect(v.reason.startsWith('mcp-missing-arg:')).toBe(true);
        continue;
      }
      for (const f of t.requiredArgs) {
        expect(f in v.value).toBe(true);
      }
    }
  });
});
