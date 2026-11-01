// Engine spec for approval gates (FORGE AI-080). Pinned vectors first,
// then a 500-case mulberry32(42) sweep against an independent oracle.

describe('approval gates engine (FORGE AI-080)', () => {
  it('gates high risk, sensitive tools and over-budget cost', () => {
    const high = planApproval({ risk: 'high', toolClass: 'read', cost: 10 });
    expect(high.requiresApproval).toBe(true);
    expect(high.triggers).toEqual(['risk:high']);
    const write = planApproval({ risk: 'low', toolClass: 'write', cost: 10 });
    expect(write.triggers).toEqual(['tool:write']);
    const costly = planApproval({ risk: 'low', toolClass: 'read', cost: 1500 });
    expect(costly.triggers).toEqual(['cost:1500>1000']);
    const all = planApproval({ risk: 'high', toolClass: 'write', cost: 5000 });
    expect(all.triggers).toEqual(['risk:high', 'tool:write', 'cost:5000>1000']);
  });

  it('auto-approves low risk read steps within budget', () => {
    const verdict = planApproval({ risk: 'low', toolClass: 'read', cost: 10 });
    expect(verdict.requiresApproval).toBe(false);
    expect(verdict.triggers).toEqual([]);
  });

  it('normalizes case and trims whitespace before matching', () => {
    const verdict = planApproval({ risk: 'LOW', toolClass: 'Read', cost: 10 });
    expect(verdict.ok).toBe(true);
    expect(verdict.requiresApproval).toBe(false);
  });

  it('honors custom policies and their trigger ordering', () => {
    const raised = planApproval({ risk: 'medium', toolClass: 'read', cost: 10, policy: { riskLevels: ['medium'] } });
    expect(raised.triggers).toEqual(['risk:medium']);
    const lifted = planApproval({ risk: 'low', toolClass: 'read', cost: 1200, policy: { maxAutoCost: 2000 } });
    expect(lifted.requiresApproval).toBe(false);
    const strict = planApproval({ risk: 'low', toolClass: 'read', cost: 10, policy: { toolClasses: ['read'] } });
    expect(strict.triggers).toEqual(['tool:read']);
    const empty = planApproval({ risk: 'high', toolClass: 'write', cost: 5000, policy: {} });
    expect(empty.triggers).toEqual(['risk:high', 'tool:write', 'cost:5000>1000']);
  });

  it('resolves approvals and enforces the reject reason rule', () => {
    const approved = resolveApproval({ gateId: 'g1', decision: 'approve' });
    expect(approved).toEqual({ ok: true, gateId: 'g1', decision: 'approve' });
    const rejected = resolveApproval({ gateId: 'g2', decision: 'REJECT', reason: ' budget over limit ' });
    expect(rejected.decision).toBe('reject');
    expect(rejected.reasonText).toBe('budget over limit');
  });

  it('refuses malformed inputs with named reasons', () => {
    expect(planApproval({ toolClass: 'read', cost: 10 }).reason).toBe('approval-risk-invalid');
    expect(planApproval({ risk: 'low', cost: 10 }).reason).toBe('approval-tool-class-invalid');
    expect(planApproval({ risk: 'low', toolClass: 'read', cost: -5 }).reason).toBe('approval-cost-invalid');
    expect(planApproval({ risk: 'low', toolClass: 'read', cost: 10, policy: null }).reason).toBe('approval-policy-invalid');
    expect(planApproval({ risk: 'low', toolClass: 'read', cost: 10, policy: { riskLevels: [] } }).reason).toBe('approval-policy-invalid');
    expect(planApproval({ risk: 'low', toolClass: 'read', cost: 10, policy: { toolClasses: ['delete'] } }).reason).toBe('approval-policy-invalid');
    expect(planApproval({ risk: 'low', toolClass: 'read', cost: 10, policy: { maxAutoCost: 'low' } }).reason).toBe('approval-policy-invalid');
    expect(resolveApproval({ decision: 'approve' }).reason).toBe('approval-gate-missing');
    expect(resolveApproval({ gateId: 'g4', decision: 'defer' }).reason).toBe('approval-decision-unknown:defer');
    expect(resolveApproval({ gateId: 'g3', decision: 'reject' }).reason).toBe('approval-reject-reason-missing');
    expect(resolveApproval({ gateId: 'g3', decision: 'reject', reason: '   ' }).reason).toBe('approval-reject-reason-missing');
  });

  it('matches an independent oracle across 500 random cases', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function stable(value: unknown): string {
      if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
      if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
      const keys = Object.keys(value as Record<string, unknown>).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k])).join(',') + '}';
    }
    function normalizeListOracle(raw: unknown, catalog: string[]): string[] | null {
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const out: string[] = [];
      for (const item of raw) {
        if (typeof item !== 'string') return null;
        const value = item.trim().toLowerCase();
        if (catalog.indexOf(value) === -1) return null;
        out.push(value);
      }
      return out;
    }
    function oraclePlan(inp: PlanApprovalInput): PlanApprovalResult {
      const risk = typeof inp?.risk === 'string' ? (inp.risk as string).trim().toLowerCase() : '';
      const RISKS = ['low', 'medium', 'high'];
      const TOOLS = ['read', 'write', 'exec', 'network'];
      if (RISKS.indexOf(risk) === -1) return { ok: false, reason: 'approval-risk-invalid' };
      const tc = typeof inp?.toolClass === 'string' ? (inp.toolClass as string).trim().toLowerCase() : '';
      if (TOOLS.indexOf(tc) === -1) return { ok: false, reason: 'approval-tool-class-invalid' };
      const cost = inp?.cost;
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return { ok: false, reason: 'approval-cost-invalid' };
      let rl = ['high'];
      let tcs = ['write', 'exec', 'network'];
      let mac = 1000;
      const p = inp?.policy;
      if (p !== undefined) {
        if (p === null || typeof p !== 'object' || Array.isArray(p)) return { ok: false, reason: 'approval-policy-invalid' };
        if (p.riskLevels !== undefined) {
          const n = normalizeListOracle(p.riskLevels, RISKS);
          if (n === null) return { ok: false, reason: 'approval-policy-invalid' };
          rl = n;
        }
        if (p.toolClasses !== undefined) {
          const n = normalizeListOracle(p.toolClasses, TOOLS);
          if (n === null) return { ok: false, reason: 'approval-policy-invalid' };
          tcs = n;
        }
        if (p.maxAutoCost !== undefined) {
          const m = p.maxAutoCost;
          if (typeof m !== 'number' || !Number.isFinite(m) || m < 0) return { ok: false, reason: 'approval-policy-invalid' };
          mac = m;
        }
      }
      const trig: string[] = [];
      if (rl.indexOf(risk) !== -1) trig.push('risk:' + risk);
      if (tcs.indexOf(tc) !== -1) trig.push('tool:' + tc);
      if (cost > mac) trig.push('cost:' + cost + '>' + mac);
      return { ok: true, risk, toolClass: tc, cost, requiresApproval: trig.length > 0, triggers: trig };
    }
    const rand = mulberry32(42);
    let mismatches = 0;
    const reasonsSeen = new Set<string>();
    let autoApproved = 0;
    for (let c = 0; c < 500; c++) {
      const riskRoll = rand();
      const risk = riskRoll < 0.05 ? 'urgent' : riskRoll < 0.1 ? 7 : ['low', 'medium', 'high'][Math.floor(rand() * 3)];
      const tcRoll = rand();
      const toolClass = tcRoll < 0.05 ? 'delete' : tcRoll < 0.1 ? null : ['read', 'write', 'exec', 'network'][Math.floor(rand() * 4)];
      const costRoll = rand();
      const cost = costRoll < 0.05 ? '500' : costRoll < 0.1 ? -5 : Math.floor(rand() * 3000);
      const polRoll = rand();
      let policy: unknown;
      if (polRoll < 0.25) policy = undefined;
      else if (polRoll < 0.35) policy = null;
      else if (polRoll < 0.45) policy = { maxAutoCost: Math.floor(rand() * 2000) };
      else if (polRoll < 0.55) policy = { riskLevels: [['low', 'medium', 'high'][Math.floor(rand() * 3)]] };
      else if (polRoll < 0.65) policy = { toolClasses: [['read', 'write', 'exec', 'network'][Math.floor(rand() * 4)]] };
      else if (polRoll < 0.72) policy = { riskLevels: ['high'], toolClasses: ['write', 'exec', 'network'], maxAutoCost: 1000 };
      else if (polRoll < 0.78) policy = { maxAutoCost: 'low' };
      else policy = { riskLevels: [['low', 'medium', 'high'][Math.floor(rand() * 3)]], toolClasses: [['read', 'write', 'exec', 'network'][Math.floor(rand() * 4)]], maxAutoCost: Math.floor(rand() * 2500) };
      const input: Record<string, unknown> = { risk, toolClass, cost };
      if (policy !== undefined) input.policy = policy;
      const mine = planApproval(input as PlanApprovalInput);
      const oracle = oraclePlan(input as PlanApprovalInput);
      if (stable(mine) !== stable(oracle)) mismatches++;
      if (mine.reason) reasonsSeen.add(mine.reason);
      if (mine.ok && mine.requiresApproval === false) autoApproved++;
    }
    expect(mismatches).toBe(0);
    expect(reasonsSeen.size).toBeGreaterThanOrEqual(4);
    expect(autoApproved).toBeGreaterThan(20);
  });
});
