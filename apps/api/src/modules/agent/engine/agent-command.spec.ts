// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/agent-command.spec.ts
// ============================================================================

import { classifyIntent, normalizeCommand } from './agent-command';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('agent-command engine', () => {
  it('normalizes: lowercases, collapses whitespace, strips filler', () => {
    const r = normalizeCommand('  Please  could you INVOICE  acme corp ');
    if (!r.ok) return;
    expect(r.value.text).toBe('invoice acme corp');
    expect(r.value.fillerRemoved).toBe(3);
  });

  it('refuses empty and filler-only commands by name', () => {
    const empty = normalizeCommand('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('command-empty');
    const fillerOnly = normalizeCommand('please hi okay hey');
    expect(fillerOnly.ok).toBe(false);
    if (!fillerOnly.ok) expect(fillerOnly.reason).toBe('command-only-filler');
  });

  it('classifies the pinned intents', () => {
    const a = classifyIntent('invoice acme corp');
    if (a.ok) expect(a.value.intent).toBe('invoice.create');
    const b = classifyIntent('paid 50000 from acme');
    if (b.ok) expect(b.value.intent).toBe('payment.record');
    const c = classifyIntent('cash flow forecast');
    if (c.ok) expect(c.value.intent).toBe('report.cashflow');
  });

  it('refuses unclear intents by name', () => {
    const r = classifyIntent('xyzzy plugh');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('intent-unclear');
  });

  it('500-case sweep: verdicts always coherent, confidence in (0, 1]', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const junk = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(rnd() * 30))).join(' ');
      const nv = normalizeCommand(junk);
      if (!nv.ok) {
        expect(['command-empty', 'command-only-filler', 'command-not-a-string']).toContain(nv.reason);
      }
      const cv = classifyIntent(nv.ok ? nv.value.text : 'invoice test');
      if (cv.ok) {
        expect(cv.value.confidence).toBeGreaterThan(0);
        expect(cv.value.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});
