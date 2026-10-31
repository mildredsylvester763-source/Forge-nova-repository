import {
  checkToolPermission,
  toolsForPlan,
  TOOLS,
  TOOL_CLASSES,
  AGENT_TOOLS,
  ACTION_TOOLS,
} from './tool-registry';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tool-registry engine (FORGE AI-077)', () => {
  it('checks per-tool permissions against the deny-by-default allowlists', () => {
    expect(checkToolPermission({ agent: 'researcher', tool: 'web-search' })).toEqual({
      ok: true,
      agent: 'researcher',
      tool: 'web-search',
      cls: 'read',
    });
    expect(checkToolPermission({ agent: 'writer', tool: 'shell-exec' })).toMatchObject({
      reason: 'tool-denied:writer:shell-exec',
    });
    expect(checkToolPermission({ agent: 'writer', tool: 'fs-write' })).toEqual({
      ok: true,
      agent: 'writer',
      tool: 'fs-write',
      cls: 'write',
    });
    expect(checkToolPermission({ agent: 'bot', tool: 'fs-read' })).toMatchObject({
      reason: 'tool-agent-unknown:bot',
    });
    expect(checkToolPermission({ agent: 'writer', tool: 'laser' })).toMatchObject({
      reason: 'tool-unknown:laser',
    });
    expect(checkToolPermission({ tool: 'fs-read' })).toMatchObject({
      reason: 'tool-agent-missing',
    });
    expect(checkToolPermission({ agent: 'writer' })).toMatchObject({
      reason: 'tool-name-missing',
    });
  });

  it('maps plan assignments to required tools and refuses denied pairs', () => {
    const ok = toolsForPlan({
      assignments: [
        { agent: 'researcher', action: 'search' },
        { agent: 'writer', action: 'write' },
      ],
    });
    expect(ok.required).toEqual([
      { step: 1, agent: 'researcher', action: 'search', tool: 'web-search' },
      { step: 2, agent: 'writer', action: 'write', tool: 'fs-write' },
    ]);
    expect(toolsForPlan({ assignments: [{ agent: 'writer', action: 'run' }] })).toMatchObject({
      reason: 'tool-denied:writer:shell-exec',
    });
    expect(toolsForPlan({ assignments: [] })).toMatchObject({ reason: 'tool-plan-empty' });
    expect(toolsForPlan({ assignments: [{ agent: 'bot', action: 'search' }] })).toMatchObject({
      reason: 'tool-agent-unknown:bot',
    });
    expect(toolsForPlan({ assignments: [{ agent: 'researcher', action: 'dance' }] })).toMatchObject({
      reason: 'tool-action-unknown:dance',
    });
    expect(toolsForPlan({ assignments: [{ action: 'search' }] })).toMatchObject({
      reason: 'tool-agent-unknown:missing',
    });
    expect(toolsForPlan({ assignments: [{ agent: 'researcher' }] })).toMatchObject({
      reason: 'tool-action-unknown:missing',
    });
  });

  it('exposes the tool catalog and classes', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'web-search',
      'web-fetch',
      'fs-read',
      'fs-write',
      'shell-exec',
      'db-query',
      'db-migrate',
      'mail-send',
    ]);
    expect(TOOL_CLASSES).toEqual(['read', 'write', 'exec', 'network']);
    expect(AGENT_TOOLS.executor).toContain('shell-exec');
    expect(ACTION_TOOLS.verify).toBe('db-query');
    expect(ACTION_TOOLS.present).toBe('mail-send');
  });

  it('matches an independent oracle on 500 mulberry32(42) permission cases', () => {
    const rand = mulberry32(42);
    const AGENT_LIST = ['coordinator', 'researcher', 'writer', 'executor', 'reviewer', 'bot', ''];
    const TOOL_LIST = TOOLS.map((t) => t.name).concat(['laser', '']);
    const ALLOW: Record<string, string[]> = {
      coordinator: ['mail-send', 'fs-read'],
      researcher: ['web-search', 'web-fetch', 'fs-read'],
      writer: ['fs-read', 'fs-write'],
      executor: ['shell-exec', 'fs-read', 'fs-write'],
      reviewer: ['fs-read', 'db-query'],
    };
    const CLS: Record<string, string> = {};
    for (const t of TOOLS) {
      CLS[t.name] = t.cls;
    }
    for (let c = 0; c < 500; c++) {
      const agent = AGENT_LIST[Math.floor(rand() * AGENT_LIST.length)];
      const tool = TOOL_LIST[Math.floor(rand() * TOOL_LIST.length)];
      const got = checkToolPermission({ agent, tool });
      const a = agent.trim().toLowerCase();
      const t = tool.trim().toLowerCase();
      let expOk = true;
      let expReason = '';
      if (a.length === 0) {
        expOk = false;
        expReason = 'tool-agent-missing';
      } else if (!ALLOW[a]) {
        expOk = false;
        expReason = 'tool-agent-unknown:' + a;
      } else if (t.length === 0) {
        expOk = false;
        expReason = 'tool-name-missing';
      } else if (!CLS[t]) {
        expOk = false;
        expReason = 'tool-unknown:' + t;
      } else if (!ALLOW[a].includes(t)) {
        expOk = false;
        expReason = 'tool-denied:' + a + ':' + t;
      }
      expect(got.ok).toBe(expOk);
      if (expOk) {
        expect(got).toEqual({ ok: true, agent: a, tool: t, cls: CLS[t] });
      } else {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
    for (let c = 0; c < 500; c++) {
      const n = Math.floor(rand() * 7);
      const assignments: Array<Record<string, unknown>> = [];
      for (let i = 0; i < n; i++) {
        assignments.push({
          agent: AGENT_LIST[Math.floor(rand() * AGENT_LIST.length)],
          action: ['search', 'write', 'run', 'verify', 'present', 'dance'][Math.floor(rand() * 6)],
        });
      }
      const got = toolsForPlan({ assignments });
      const MAP: Record<string, string> = {
        search: 'web-search',
        write: 'fs-write',
        run: 'shell-exec',
        verify: 'db-query',
        present: 'mail-send',
      };
      let expOk = true;
      let expReason = '';
      const expRequired: Array<{ step: number; agent: string; action: string; tool: string }> = [];
      if (assignments.length === 0) {
        expOk = false;
        expReason = 'tool-plan-empty';
      }
      for (let i = 0; expOk && i < assignments.length; i++) {
        const a = String(assignments[i].agent ?? '')
          .trim()
          .toLowerCase();
        const act = String(assignments[i].action ?? '')
          .trim()
          .toLowerCase();
        if (!ALLOW[a]) {
          expOk = false;
          expReason = 'tool-agent-unknown:' + (a.length > 0 ? a : 'missing');
          break;
        }
        if (!MAP[act]) {
          expOk = false;
          expReason = 'tool-action-unknown:' + (act.length > 0 ? act : 'missing');
          break;
        }
        const tool = MAP[act];
        if (!ALLOW[a].includes(tool)) {
          expOk = false;
          expReason = 'tool-denied:' + a + ':' + tool;
          break;
        }
        expRequired.push({ step: i + 1, agent: a, action: act, tool });
      }
      expect(got.ok).toBe(expOk);
      if (expOk) {
        expect(got.required).toEqual(expRequired);
      } else {
        expect(got.reason ?? '').toBe(expReason);
      }
    }
  });
});
