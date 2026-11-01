// Functional spec for the task runtime module (FORGE AI-079..083).
// RepoDouble stands in for the TypeORM repository; the engines are already
// pinned by their own specs, so this spec pins the service laws: sync
// wrappers throw named refusals, step validation reports failed checks as
// verdicts instead of throwing, and stored runs are isolated per user.

import { Repository } from 'typeorm';
import { TaskRun } from './entities/task-run.entity';
import { TaskRuntimeService } from './task-runtime.service';

class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;

  create(partial: Partial<T>): T {
    return { ...partial } as T;
  }

  async save(row: T): Promise<T> {
    const stampable = row as unknown as { id?: string; createdAt?: Date; updatedAt?: Date };
    if (!stampable.createdAt) stampable.createdAt = new Date();
    if (!stampable.updatedAt) stampable.updatedAt = new Date();
    if (!stampable.id) {
      stampable.id = 'row-' + ++this.seq;
      this.rows.push(row);
    } else {
      const idx = this.rows.findIndex((r) => (r as { id?: string }).id === stampable.id);
      if (idx >= 0) this.rows[idx] = row;
      else this.rows.push(row);
    }
    return row;
  }

  async find(opts?: { where?: Record<string, unknown>; order?: Record<string, string>; take?: number }): Promise<T[]> {
    let out = this.rows.slice();
    const where = opts?.where ?? {};
    for (const key of Object.keys(where)) {
      out = out.filter((r) => (r as Record<string, unknown>)[key] === where[key]);
    }
    if (opts?.order?.createdAt === 'DESC') {
      out = out.slice().sort((a, b) =>
        String((b as Record<string, unknown>).createdAt).localeCompare(
          String((a as Record<string, unknown>).createdAt),
        ),
      );
    }
    if (opts?.take) out = out.slice(0, opts.take);
    return out;
  }

  async findOne(opts?: { where?: Record<string, unknown> }): Promise<T | null> {
    const all = await this.find({ where: opts?.where });
    return all[0] ?? null;
  }
}

function makeService() {
  const runs = new RepoDouble<TaskRun>();
  const svc = new TaskRuntimeService(runs as unknown as Repository<TaskRun>);
  return { svc, runs };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('task-runtime functional lifecycle (FORGE AI-079..083)', () => {
  it('exposes the catalogs synchronously', () => {
    const { svc } = makeService();
    expect(svc.listStepCheckTypes()).toEqual(['exit-code', 'field', 'max-length', 'contains', 'equals']);
    expect(svc.listApprovalRiskLevels()).toEqual(['low', 'medium', 'high']);
    expect(svc.listApprovalToolClasses()).toEqual(['read', 'write', 'exec', 'network']);
    expect(svc.listTaskStates()).toEqual(['running', 'paused', 'cancelled', 'completed', 'failed', 'overtaken']);
    expect(svc.listTaskCommands()).toEqual(['pause', 'resume', 'cancel', 'takeover']);
    expect(svc.listTaskEventTypes()).toEqual([
      'task-created',
      'step-started',
      'step-validated',
      'step-completed',
      'step-failed',
      'gate-requested',
      'gate-resolved',
      'task-paused',
      'task-resumed',
      'task-cancelled',
      'task-completed',
      'task-failed',
      'takeover',
    ]);
    expect(svc.listParallelModes()).toEqual(['strict', 'relaxed']);
  });

  it('throws named refusals from the sync wrappers', () => {
    const { svc } = makeService();
    expect(() => svc.validateStep({ stepId: 's1', checks: [{ type: 'digest' }] })).toThrow(
      'stepv-check-type-unknown:digest',
    );
    expect(() => svc.validateStep({ stepId: '', checks: [{ type: 'exit-code' }] })).toThrow('stepv-step-id-missing');
    expect(() => svc.planApproval({ risk: 'urgent', toolClass: 'read', cost: 5 })).toThrow('approval-risk-invalid');
    expect(() => svc.planApproval({ risk: 'low', toolClass: 'delete', cost: 5 })).toThrow('approval-tool-class-invalid');
    expect(() => svc.planApproval({ risk: 'low', toolClass: 'read', cost: -1 })).toThrow('approval-cost-invalid');
    expect(() => svc.resolveApproval({ gateId: 'g1', decision: 'reject' })).toThrow('approval-reject-reason-missing');
    expect(() => svc.resolveApproval({ gateId: 'g1', decision: 'defer' })).toThrow('approval-decision-unknown:defer');
    expect(() => svc.applyTaskCommand({ state: 'completed', command: 'pause' })).toThrow(
      'task-invalid-transition:completed:pause',
    );
    expect(() => svc.applyTaskCommand({ state: 'zombie', command: 'pause' })).toThrow('task-state-unknown:zombie');
    expect(() => svc.detectParallelConflicts({ agents: [] })).toThrow('parallel-agents-empty');
    expect(() => svc.detectParallelConflicts({ agents: [{ agentId: 'a' }], mode: 'loose' })).toThrow(
      'parallel-mode-unknown:loose',
    );
    expect(() => svc.detectParallelConflicts({ agents: [{ agentId: 'a' }, { agentId: 'a' }] })).toThrow(
      'parallel-agent-id-duplicate:a',
    );
  });

  it('validates steps with named failure details', () => {
    const { svc } = makeService();
    const clean = svc.validateStep({
      stepId: 's1',
      output: { exitCode: 0, title: 'Report' },
      checks: [{ type: 'exit-code' }, { type: 'field', path: 'title' }],
    });
    expect(clean.ok).toBe(true);
    expect(clean.passed).toBe(2);
    expect(clean.failures).toEqual([]);
    const dirty = svc.validateStep({
      stepId: 's1',
      output: { exitCode: 1 },
      checks: [{ type: 'exit-code' }, { type: 'field', path: 'title' }, { type: 'max-length', path: 'notes', limit: 3 }],
    });
    expect(dirty.ok).toBe(false);
    expect(dirty.failed).toBe(3);
    expect(dirty.failures).toEqual([
      { index: 1, check: 'exit-code', detail: 'exit:1' },
      { index: 2, check: 'field', detail: 'field-missing:title' },
      { index: 3, check: 'max-length', detail: 'max-length-missing:notes' },
    ]);
  });

  it('plans approval gates and resolves decisions', () => {
    const { svc } = makeService();
    const gated = svc.planApproval({ risk: 'high', toolClass: 'read', cost: 10 });
    expect(gated.requiresApproval).toBe(true);
    expect(gated.triggers).toEqual(['risk:high']);
    const auto = svc.planApproval({ risk: 'low', toolClass: 'read', cost: 10 });
    expect(auto.requiresApproval).toBe(false);
    const custom = svc.planApproval({ risk: 'medium', toolClass: 'read', cost: 10, policy: { riskLevels: ['medium'] } });
    expect(custom.triggers).toEqual(['risk:medium']);
    const approved = svc.resolveApproval({ gateId: 'g1', decision: 'approve' });
    expect(approved.ok).toBe(true);
    expect(approved.decision).toBe('approve');
    const rejected = svc.resolveApproval({ gateId: 'g2', decision: 'REJECT', reason: ' over budget ' });
    expect(rejected.reasonText).toBe('over budget');
  });

  it('walks task commands and detects parallel conflicts', () => {
    const { svc } = makeService();
    const paused = svc.applyTaskCommand({ state: 'running', command: 'pause' });
    expect(paused.to).toBe('paused');
    expect(paused.terminal).toBe(false);
    const taken = svc.applyTaskCommand({ state: 'paused', command: 'takeover' });
    expect(taken.to).toBe('overtaken');
    expect(taken.terminal).toBe(true);
    const relaxed = svc.detectParallelConflicts({
      agents: [{ agentId: 'a1', writes: ['db'] }, { agentId: 'a2', writes: ['db'] }],
      mode: 'relaxed',
    });
    expect(relaxed.conflicts).toEqual([{ a: 'a1', b: 'a2', resource: 'db', kind: 'write-write' }]);
    const strict = svc.detectParallelConflicts({
      agents: [{ agentId: 'a1', reads: ['db'] }, { agentId: 'a2', writes: ['db'] }],
    });
    expect(strict.conflicts).toEqual([{ a: 'a2', b: 'a1', resource: 'db', kind: 'read-write' }]);
    const calm = svc.detectParallelConflicts({
      agents: [{ agentId: 'a1', reads: ['x'] }, { agentId: 'a2', writes: ['y'] }],
    });
    expect(calm.hasConflicts).toBe(false);
  });

  it('runs the create, record, replay lifecycle per user', async () => {
    const { svc, runs } = makeService();
    const created = await svc.createTask(USER, { goal: 'Ship the invoice report' });
    expect(created.state).toBe('running');
    expect(created.eventCount).toBe(1);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].userId).toBe(USER);
    const stepStarted = await svc.recordEvent(USER, { runId: created.id, type: 'step-started', stepId: 's1' });
    expect(stepStarted.seq).toBe(2);
    expect(stepStarted.state).toBe('running');
    const gate = await svc.recordEvent(USER, { runId: created.id, type: 'gate-requested', gateId: 'g1' });
    expect(gate.seq).toBe(3);
    const pausedRun = await svc.recordEvent(USER, { runId: created.id, type: 'task-paused' });
    expect(pausedRun.state).toBe('paused');
    expect(pausedRun.eventCount).toBe(4);
    expect(runs.rows[0].events).toHaveLength(4);
    const midReplay = await svc.replayRun(USER, { runId: created.id, toSeq: 3 });
    expect(midReplay.state).toBe('running');
    expect(midReplay.steps).toEqual([{ stepId: 's1', status: 'started' }]);
    expect(midReplay.gates).toEqual([{ gateId: 'g1', status: 'requested' }]);
    const fullReplay = await svc.replayRun(USER, { runId: created.id });
    expect(fullReplay.state).toBe('paused');
    expect(fullReplay.applied).toBe(4);
    await expect(svc.recordEvent(USER, { runId: created.id, type: 'teleported' })).rejects.toThrow(
      'history-type-unknown:teleported',
    );
    await expect(svc.recordEvent(OTHER, { runId: created.id, type: 'task-paused' })).rejects.toThrow(
      'task-run-not-found:' + created.id,
    );
    const second = await svc.createTask(USER, { goal: 'Second run' });
    expect(second.eventCount).toBe(1);
    const mine = await svc.listRuns(USER);
    expect(mine).toHaveLength(2);
    const theirs = await svc.listRuns(OTHER);
    expect(theirs).toHaveLength(0);
  });

  it('refuses out-of-bounds replay and missing runs by name', async () => {
    const { svc } = makeService();
    const created = await svc.createTask(USER, {});
    expect(created.goal).toBe('');
    await expect(svc.replayRun(USER, { runId: created.id, toSeq: 99 })).rejects.toThrow('history-to-seq-invalid:99');
    await expect(svc.replayRun(USER, { runId: 'missing-run', toSeq: 1 })).rejects.toThrow(
      'task-run-not-found:missing-run',
    );
    await expect(svc.recordEvent(USER, { runId: 'missing-run', type: 'task-paused' })).rejects.toThrow(
      'task-run-not-found:missing-run',
    );
  });
});
