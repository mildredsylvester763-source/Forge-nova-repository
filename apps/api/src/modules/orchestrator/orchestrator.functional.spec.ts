// Functional spec for the orchestrator module (FORGE AI-073..078).
// RepoDouble stands in for the TypeORM repository; the engines are already
// pinned by their own specs, so this spec pins the service laws: sync
// wrappers throw named refusals, async plan methods reject with the same
// names, plans are isolated per user, and edits re-preview risk in place.

import { Repository } from 'typeorm';
import { OrchestratorPlan } from './entities/orchestrator-plan.entity';
import { OrchestratorService } from './orchestrator.service';

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
  const plans = new RepoDouble<OrchestratorPlan>();
  const svc = new OrchestratorService(plans as unknown as Repository<OrchestratorPlan>);
  return { svc, plans };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('orchestrator functional lifecycle (FORGE AI-073..078)', () => {
  it('exposes the catalogs synchronously', () => {
    const { svc } = makeService();
    expect(svc.listIntents()).toEqual(['question', 'command', 'creation', 'analysis', 'comparison', 'conversation']);
    expect(svc.listPlanActions()).toEqual(['search', 'write', 'run', 'verify', 'present']);
    expect(svc.listAgents()).toEqual(['coordinator', 'researcher', 'writer', 'executor', 'reviewer']);
    expect(svc.listTools().map((t) => t.name)).toEqual([
      'web-search',
      'web-fetch',
      'fs-read',
      'fs-write',
      'shell-exec',
      'db-query',
      'db-migrate',
      'mail-send',
    ]);
    expect(svc.listToolClasses()).toEqual(['read', 'write', 'exec', 'network']);
  });

  it('classifies intents synchronously and throws named refusals', () => {
    const { svc } = makeService();
    const out = svc.classifyIntent({ text: 'How do I fix the broken build?' });
    expect(out.intent).toBe('question');
    expect(out.score).toBe(2);
    expect(out.confidence).toBe(0.5);
    expect(() => svc.classifyIntent({ text: 'banana' })).toThrow('intent-no-match');
    expect(() => svc.classifyIntent({ text: 'what is a database', allowed: ['command'] })).toThrow(
      'intent-not-allowed:question',
    );
  });

  it('creates plans with classified intent, preview risk and cost', async () => {
    const { svc, plans } = makeService();
    const out = await svc.createPlan(USER, {
      goal: 'Write a report',
      steps: [{ action: 'search' }, { action: 'write' }, { action: 'present' }],
    });
    expect(out.id).toBeTruthy();
    expect(out.intent).toBe('creation');
    expect(out.risk).toBe('medium');
    expect(out.estimatedCost).toBe(1800);
    expect(out.requiresApproval).toBe(false);
    expect(out.stepCount).toBe(3);
    expect(out.steps[1].dependsOn).toEqual(['s1']);
    expect(plans.rows).toHaveLength(1);
    expect(plans.rows[0].userId).toBe(USER);
    expect(plans.rows[0].intent).toBe('creation');

    const plain = await svc.createPlan(USER, { goal: 'ship the report', steps: [{ action: 'search' }] });
    expect(plain.intent).toBe('unclassified');

    const forced = await svc.createPlan(USER, { goal: 'ship it', intent: 'command', steps: [{ action: 'run' }] });
    expect(forced.intent).toBe('command');
    expect(forced.risk).toBe('high');
    expect(forced.requiresApproval).toBe(true);

    await expect(
      svc.createPlan(USER, { goal: 'ship it', intent: 'chitchat', steps: [{ action: 'search' }] }),
    ).rejects.toThrow('plan-intent-unknown:chitchat');
    await expect(svc.createPlan(USER, { goal: 'ship it', steps: [{ action: 'dance' }] })).rejects.toThrow(
      'plan-step-action-unknown:dance',
    );
    expect(plans.rows).toHaveLength(3);
  });

  it('edits stored plans and re-previews risk after the edit', async () => {
    const { svc, plans } = makeService();
    const out = await svc.createPlan(USER, {
      goal: 'Write a report',
      steps: [{ action: 'search' }, { action: 'run' }, { action: 'present' }],
    });
    expect(out.risk).toBe('high');
    const edited = await svc.editPlan(USER, { planId: out.id, edits: [{ op: 'remove', id: 's2' }] });
    expect(edited.risk).toBe('low');
    expect(edited.estimatedCost).toBe(600);
    expect(edited.requiresApproval).toBe(false);
    expect(edited.steps.map((s) => s.action)).toEqual(['search', 'present']);
    expect(plans.rows[0].steps).toHaveLength(2);

    await expect(svc.editPlan(USER, { planId: 'missing-id', edits: [{ op: 'remove', id: 's1' }] })).rejects.toThrow(
      'plan-not-found:missing-id',
    );
    await expect(svc.editPlan(USER, { planId: out.id, edits: [{ op: 'remove', id: 's9' }] })).rejects.toThrow(
      'plan-edit-id-unknown:s9',
    );
    expect(plans.rows[0].steps).toHaveLength(2);
  });

  it('previews plans and routes handoffs synchronously', () => {
    const { svc } = makeService();
    const preview = svc.previewPlan({
      steps: [{ action: 'search' }, { action: 'write', file: 'report.md' }, { action: 'run', file: 'report.md' }],
    });
    expect(preview.filesTouched).toEqual(['report.md']);
    expect(preview.risk).toBe('high');
    expect(preview.estimatedCost).toBe(2200);
    expect(preview.requiresApproval).toBe(true);
    expect(() => svc.previewPlan({ steps: [{ action: 'teleport' }] })).toThrow('preview-step-action-unknown:teleport');

    const handoffs = svc.planHandoffs({
      steps: [{ action: 'search' }, { action: 'write' }, { action: 'run' }, { action: 'verify' }],
    });
    expect(handoffs.assignments?.map((a) => a.agent)).toEqual(['researcher', 'writer', 'executor', 'reviewer']);
    expect(handoffs.handoffs).toHaveLength(3);
    expect(() =>
      svc.planHandoffs({ steps: [{ action: 'search' }, { action: 'write' }, { action: 'search' }] }),
    ).toThrow('handoff-bounce-detected:researcher->writer->researcher');
  });

  it('checks tool permissions and sandbox runs synchronously', () => {
    const { svc } = makeService();
    const perm = svc.checkToolPermission({ agent: 'researcher', tool: 'web-search' });
    expect(perm.cls).toBe('read');
    expect(() => svc.checkToolPermission({ agent: 'writer', tool: 'shell-exec' })).toThrow(
      'tool-denied:writer:shell-exec',
    );

    const tools = svc.toolsForPlan({
      assignments: [
        { agent: 'researcher', action: 'search' },
        { agent: 'writer', action: 'write' },
      ],
    });
    expect(tools.required).toEqual([
      { step: 1, agent: 'researcher', action: 'search', tool: 'web-search' },
      { step: 2, agent: 'writer', action: 'write', tool: 'fs-write' },
    ]);

    const run = svc.runSandboxed({ tool: 'shell-exec', command: 'npm test', timeout: 60 });
    expect(run.restrictions).toEqual(['workspace-only-fs', 'no-network', 'timeout-60s']);
    expect(() => svc.runSandboxed({ tool: 'web-fetch', egress: { host: 'evil.example' } })).toThrow(
      'sandbox-egress-denied:evil.example',
    );
    expect(() => svc.runSandboxed({ tool: 'fs-write', fileWrites: ['/etc/passwd'] })).toThrow(
      'sandbox-path-outside-workspace:/etc/passwd',
    );
  });

  it('isolates plans per user and refuses unknown plan ids', async () => {
    const { svc } = makeService();
    const out = await svc.createPlan(USER, { goal: 'Write a report', steps: [{ action: 'search' }] });
    expect(await svc.listPlans(USER)).toHaveLength(1);
    expect(await svc.listPlans(OTHER)).toHaveLength(0);
    await expect(svc.getPlan(OTHER, out.id)).rejects.toThrow('plan-not-found:' + out.id);
    const mine = await svc.getPlan(USER, out.id);
    expect(mine.goal).toBe('Write a report');
  });
});
