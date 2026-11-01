import { detectParallelConflicts, DetectParallelConflictsInput, DetectParallelConflictsResult, ParallelConflict } from './parallel-agents';

// Engine spec for parallel agents (FORGE AI-083). Pinned vectors first,
// then a 500-case mulberry32(42) sweep against an independent oracle.

describe('parallel agents engine (FORGE AI-083)', () => {
  it('detects write-write conflicts in relaxed mode', () => {
    const verdict = detectParallelConflicts({
      agents: [
        { agentId: 'a1', writes: ['db.users', 'file.log'] },
        { agentId: 'a2', writes: ['db.users'] },
      ],
      mode: 'relaxed',
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.conflicts).toEqual([{ a: 'a1', b: 'a2', resource: 'db.users', kind: 'write-write' }]);
  });

  it('detects read-write conflicts only in strict mode', () => {
    const strict = detectParallelConflicts({
      agents: [
        { agentId: 'a1', reads: ['db.users'] },
        { agentId: 'a2', writes: ['db.users'] },
      ],
    });
    expect(strict.conflicts).toEqual([{ a: 'a2', b: 'a1', resource: 'db.users', kind: 'read-write' }]);
    const relaxed = detectParallelConflicts({
      agents: [
        { agentId: 'a1', reads: ['db.users'] },
        { agentId: 'a2', writes: ['db.users'] },
      ],
      mode: 'relaxed',
    });
    expect(relaxed.hasConflicts).toBe(false);
  });

  it('reports the writer as the read-write conflict owner across pairs', () => {
    const verdict = detectParallelConflicts({
      agents: [
        { agentId: 'alpha', reads: ['db.users'], writes: ['cache.a'] },
        { agentId: 'beta', reads: ['cache.a'], writes: ['db.users'] },
      ],
    });
    expect(verdict.conflicts).toEqual([
      { a: 'alpha', b: 'beta', resource: 'cache.a', kind: 'read-write' },
      { a: 'beta', b: 'alpha', resource: 'db.users', kind: 'read-write' },
    ]);
  });

  it('emits both conflict kinds when a pair reads and writes the same resource', () => {
    const verdict = detectParallelConflicts({
      agents: [
        { agentId: 'writer', reads: [], writes: ['q'] },
        { agentId: 'reader', reads: ['q'], writes: ['q'] },
      ],
    });
    expect(verdict.conflicts).toEqual([
      { a: 'writer', b: 'reader', resource: 'q', kind: 'read-write' },
      { a: 'writer', b: 'reader', resource: 'q', kind: 'write-write' },
    ]);
  });

  it('defaults reads and writes to empty and dedupes repeated resources', () => {
    const solo = detectParallelConflicts({ agents: [{ agentId: 'solo', reads: ['x'], writes: ['y'] }] });
    expect(solo.ok).toBe(true);
    expect(solo.agentCount).toBe(1);
    expect(solo.hasConflicts).toBe(false);
    const bare = detectParallelConflicts({ agents: [{ agentId: 'a' }] });
    expect(bare.ok).toBe(true);
    const dupes = detectParallelConflicts({
      agents: [
        { agentId: 'a1', writes: ['r2', 'r1', 'r2'] },
        { agentId: 'a2', writes: ['r1', 'r2'] },
      ],
    });
    expect(dupes.conflicts).toEqual([
      { a: 'a1', b: 'a2', resource: 'r1', kind: 'write-write' },
      { a: 'a1', b: 'a2', resource: 'r2', kind: 'write-write' },
    ]);
  });

  it('refuses malformed inputs with named reasons', () => {
    expect(detectParallelConflicts({ agents: [] }).reason).toBe('parallel-agents-empty');
    expect(detectParallelConflicts({}).reason).toBe('parallel-agents-empty');
    expect(detectParallelConflicts({ agents: [null] }).reason).toBe('parallel-agent-missing:1');
    expect(detectParallelConflicts({ agents: [{ reads: [] }] }).reason).toBe('parallel-agent-id-missing:1');
    expect(detectParallelConflicts({ agents: [{ agentId: 'a' }, { agentId: 'a' }] }).reason).toBe('parallel-agent-id-duplicate:a');
    expect(detectParallelConflicts({ agents: [{ agentId: 'a', reads: 'x' }] }).reason).toBe('parallel-reads-invalid:a');
    expect(detectParallelConflicts({ agents: [{ agentId: 'a', writes: [1] }] }).reason).toBe('parallel-writes-invalid:a');
    expect(detectParallelConflicts({ agents: [{ agentId: 'a' }], mode: 'loose' }).reason).toBe('parallel-mode-unknown:loose');
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
    function oracleDetect(inp: DetectParallelConflictsInput): DetectParallelConflictsResult {
      const ag = inp.agents;
      if (!Array.isArray(ag) || ag.length === 0) return { ok: false, reason: 'parallel-agents-empty' };
      const mRaw = inp.mode;
      const m = mRaw === undefined ? 'strict' : typeof mRaw === 'string' ? (mRaw as string).trim().toLowerCase() : '';
      if (m !== 'strict' && m !== 'relaxed') return { ok: false, reason: 'parallel-mode-unknown:' + (m.length === 0 ? 'missing' : m) };
      const list: { agentId: string; reads: string[]; writes: string[] }[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < ag.length; i++) {
        const a = ag[i] as Record<string, unknown>;
        if (!(typeof a === 'object' && a !== null && !Array.isArray(a))) return { ok: false, reason: 'parallel-agent-missing:' + (i + 1) };
        const id = typeof a.agentId === 'string' ? (a.agentId as string).trim() : '';
        if (id === '') return { ok: false, reason: 'parallel-agent-id-missing:' + (i + 1) };
        if (seen.has(id)) return { ok: false, reason: 'parallel-agent-id-duplicate:' + id };
        seen.add(id);
        if (a.reads !== undefined && !(Array.isArray(a.reads) && (a.reads as unknown[]).every((x) => typeof x === 'string'))) return { ok: false, reason: 'parallel-reads-invalid:' + id };
        if (a.writes !== undefined && !(Array.isArray(a.writes) && (a.writes as unknown[]).every((x) => typeof x === 'string'))) return { ok: false, reason: 'parallel-writes-invalid:' + id };
        list.push({
          agentId: id,
          reads: a.reads === undefined ? [] : (a.reads as string[]).slice(),
          writes: a.writes === undefined ? [] : (a.writes as string[]).slice(),
        });
      }
      const out: ParallelConflict[] = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const A = list[i];
          const B = list[j];
          const ww: string[] = [];
          for (const r of A.writes) {
            if (B.writes.indexOf(r) !== -1 && ww.indexOf(r) === -1) ww.push(r);
          }
          ww.sort();
          for (const r of ww) out.push({ a: A.agentId, b: B.agentId, resource: r, kind: 'write-write' });
          if (m === 'strict') {
            const awbr: string[] = [];
            for (const r of A.writes) {
              if (B.reads.indexOf(r) !== -1 && awbr.indexOf(r) === -1) awbr.push(r);
            }
            awbr.sort();
            for (const r of awbr) out.push({ a: A.agentId, b: B.agentId, resource: r, kind: 'read-write' });
            const arbw: string[] = [];
            for (const r of A.reads) {
              if (B.writes.indexOf(r) !== -1 && arbw.indexOf(r) === -1) arbw.push(r);
            }
            arbw.sort();
            for (const r of arbw) out.push({ a: B.agentId, b: A.agentId, resource: r, kind: 'read-write' });
          }
        }
      }
      out.sort((x, y) => (x.a + '|' + x.b + '|' + x.resource + '|' + x.kind < y.a + '|' + y.b + '|' + y.resource + '|' + y.kind ? -1 : 1));
      return { ok: true, mode: m, agentCount: list.length, conflicts: out, hasConflicts: out.length > 0 };
    }
    const rand = mulberry32(42);
    const resources = ['r1', 'r2', 'r3', 'db', 'cache'];
    let mismatches = 0;
    const reasonsSeen = new Set<string>();
    let okCount = 0;
    let conflictTotal = 0;
    for (let c = 0; c < 500; c++) {
      const n = 1 + Math.floor(rand() * 4);
      const agents: unknown[] = [];
      for (let i = 0; i < n; i++) {
        const roll = rand();
        if (roll < 0.02) {
          agents.push(null);
          break;
        }
        if (roll < 0.05) {
          agents.push({ reads: [] });
          break;
        }
        const agent: Record<string, unknown> = { agentId: rand() < 0.05 ? 'dup' : 'ag' + i };
        const makeList = () => {
          const count = Math.floor(rand() * 3);
          const list: unknown[] = [];
          for (let q = 0; q < count; q++) list.push(resources[Math.floor(rand() * resources.length)]);
          return list;
        };
        if (rand() < 0.9) agent.reads = rand() < 0.05 ? 'bad' : makeList();
        if (rand() < 0.9) agent.writes = rand() < 0.05 ? [7] : makeList();
        if (rand() < 0.02) delete agent.agentId;
        agents.push(agent);
      }
      const mode = rand() < 0.5 ? 'strict' : rand() < 0.9 ? 'relaxed' : 'loose';
      const input = { agents, mode } as DetectParallelConflictsInput;
      const mine = detectParallelConflicts(input);
      const oracle = oracleDetect(input);
      if (stable(mine) !== stable(oracle)) mismatches++;
      if (mine.reason) reasonsSeen.add(mine.reason);
      if (mine.ok) {
        okCount++;
        conflictTotal += mine.conflicts!.length;
      }
    }
    expect(mismatches).toBe(0);
    expect(reasonsSeen.size).toBeGreaterThan(8);
    expect(okCount).toBeGreaterThan(200);
    expect(conflictTotal).toBeGreaterThan(100);
  });
});
