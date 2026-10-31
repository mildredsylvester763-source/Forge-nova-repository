// ============================================================================
// FILE: /apps/api/src/modules/live-testing/live-testing.functional.spec.ts
// ============================================================================
// FUNCTIONAL tests for live agent testing (FORGE TQ-001..014, TQ-030): the
// behavior a user actually experiences over behavior-true repository
// doubles: sessions planned under engine law, the full lifecycle walk with
// manual control and hand back, steps recorded under platform and safe mode
// law with deterministic narration, live chat, findings, personas and
// zero-trust isolation between users.

import { BadRequestException } from '@nestjs/common';
import { TestSession } from './entities/test-session.entity';
import { SessionStep } from './entities/session-step.entity';
import { SessionMessage } from './entities/session-message.entity';
import { SessionFinding } from './entities/session-finding.entity';
import { TestPersona } from './entities/test-persona.entity';
import { LiveTestingService } from './live-testing.service';

// ---- minimal TypeORM repository double (behavior-true, no DB needed) ----
class RepoDouble<T extends { id?: string }> {
  rows: T[] = [];
  seq = 0;
  create(partial: any): T {
    return { ...partial } as T;
  }
  async save(row: T): Promise<T> {
    // TypeORM fills @CreateDateColumn/@UpdateDateColumn on insert; the double
    // must be behavior-true to those columns or audit order breaks.
    if (!(row as any).createdAt) (row as any).createdAt = new Date();
    if (!(row as any).updatedAt) (row as any).updatedAt = new Date();
    if (!row.id) {
      row.id = 'row-' + ++this.seq;
      this.rows.push(row);
    } else {
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) this.rows[i] = row;
      else this.rows.push(row);
    }
    return row;
  }
  async find(opts: any = {}): Promise<T[]> {
    let out = this.rows.slice();
    const w = opts.where ?? {};
    for (const [k, v] of Object.entries(w)) {
      out = out.filter((r) => (r as any)[k] === v);
    }
    if (opts.order?.createdAt === 'DESC') {
      out = out
        .slice()
        .sort((a: any, b: any) =>
          String(b.createdAt).localeCompare(String(a.createdAt)),
        );
    }
    return out;
  }
  async findOne(opts: any = {}): Promise<T | null> {
    const all = await this.find({ ...opts });
    return all[0] ?? null;
  }
}

function makeService() {
  const sessions = new RepoDouble<TestSession>();
  const steps = new RepoDouble<SessionStep>();
  const messages = new RepoDouble<SessionMessage>();
  const findings = new RepoDouble<SessionFinding>();
  const personas = new RepoDouble<TestPersona>();
  const svc = new LiveTestingService(
    sessions as any,
    steps as any,
    messages as any,
    findings as any,
    personas as any,
  );
  return { svc, sessions, steps, messages, findings, personas };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('live-testing functional lifecycle (FORGE TQ-001..014, TQ-030)', () => {
  it('creates a planned session with goal tasks, default safe mode and forced production safe mode', async () => {
    const { svc, sessions } = makeService();
    const res = await svc.createSession(USER, {
      platform: 'web',
      goal: 'open the shop then check the cart',
    } as any);
    expect(res.status).toBe('planned');
    expect(res.safeMode).toBe(true);
    expect(res.forcedSafeMode).toBe(false);
    expect(res.title).toBe('open the shop');
    expect((res.goalTasks as any[])).toHaveLength(2);
    expect((res.goalTasks as any[])[1].id).toBe('task-2');
    expect(sessions.rows).toHaveLength(1);

    const prod = await svc.createSession(USER, {
      platform: 'web',
      goal: 'x goal',
      environment: 'production',
      safeMode: false,
    } as any);
    expect(prod.safeMode).toBe(true);
    expect(prod.forcedSafeMode).toBe(true);

    const off = await svc.createSession(USER, {
      platform: 'web',
      goal: 'x goal',
      safeMode: false,
    } as any);
    expect(off.safeMode).toBe(false);
    expect(off.forcedSafeMode).toBe(false);
  });

  it('walks the full lifecycle and refuses illegal or terminal moves by name', async () => {
    const { svc } = makeService();
    const session = await svc.createSession(USER, {
      platform: 'android',
      goal: 'test the checkout flow',
    } as any);

    expect((await svc.startSession(USER, { sessionId: session.id } as any)).status).toBe('running');
    await svc.pauseSession(USER, { sessionId: session.id } as any);
    await svc.resumeSession(USER, { sessionId: session.id } as any);
    await svc.takeControl(USER, { sessionId: session.id } as any);
    await svc.handBack(USER, { sessionId: session.id } as any);
    expect((await svc.completeSession(USER, { sessionId: session.id } as any)).status).toBe('completed');

    await expect(
      svc.startSession(USER, { sessionId: session.id } as any),
    ).rejects.toThrow('session-terminal:completed');

    const planned = await svc.createSession(USER, { platform: 'web', goal: 'fresh goal here' } as any);
    await expect(
      svc.pauseSession(USER, { sessionId: planned.id } as any),
    ).rejects.toThrow('session-transition-illegal:planned:paused');
  });

  it('records steps under platform law with sequence numbers and deterministic narration', async () => {
    const { svc, steps } = makeService();
    const session = await svc.createSession(USER, {
      platform: 'web',
      goal: 'browse the catalog',
    } as any);
    await svc.startSession(USER, { sessionId: session.id } as any);

    const first = await svc.recordStep(USER, {
      sessionId: session.id,
      action: 'navigate',
      target: 'https://shop.example.com',
    } as any);
    const second = await svc.recordStep(USER, {
      sessionId: session.id,
      action: 'click',
      target: 'add to cart button',
    } as any);
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.narration).toBe('Clicking add to cart button');
    expect(second.actor).toBe('ai');

    await expect(
      svc.recordStep(USER, { sessionId: session.id, action: 'swipe', target: 'photo' } as any),
    ).rejects.toThrow('platform-action-unsupported:swipe:web');
    await expect(
      svc.recordStep(USER, { sessionId: session.id, action: 'dance' } as any),
    ).rejects.toThrow('platform-action-unknown:dance');
    expect(steps.rows).toHaveLength(2);
  });

  it('blocks destructive intents and real addresses before platform law', async () => {
    const { svc, steps } = makeService();
    const safe = await svc.createSession(USER, {
      platform: 'web',
      goal: 'try the flows',
      safeMode: true,
    } as any);
    await svc.startSession(USER, { sessionId: safe.id } as any);

    await expect(
      svc.recordStep(USER, { sessionId: safe.id, action: 'delete', target: 'account row' } as any),
    ).rejects.toThrow('safe-mode-blocks-destructive:delete');
    await expect(
      svc.recordStep(USER, {
        sessionId: safe.id,
        action: 'type',
        target: 'email field',
        value: 'user@example.com',
      } as any),
    ).rejects.toThrow('safe-mode-blocks-real-address:type');

    const unsafe = await svc.createSession(USER, {
      platform: 'web',
      goal: 'danger zone',
      safeMode: false,
    } as any);
    await svc.startSession(USER, { sessionId: unsafe.id } as any);
    await expect(
      svc.recordStep(USER, { sessionId: unsafe.id, action: 'delete', target: 'x' } as any),
    ).rejects.toThrow('platform-action-unknown:delete');
    const typed = await svc.recordStep(USER, {
      sessionId: unsafe.id,
      action: 'type',
      target: 'email field',
      value: 'user@example.com',
    } as any);
    expect(typed.seq).toBe(1);
    expect(steps.rows).toHaveLength(1);
  });

  it('stores live chat messages and refuses empty ones', async () => {
    const { svc, messages } = makeService();
    const session = await svc.createSession(USER, {
      platform: 'web',
      goal: 'chat while testing',
    } as any);
    const saved = await svc.postMessage(USER, {
      sessionId: session.id,
      body: '  what are you doing?  ',
    } as any);
    expect(saved.role).toBe('human');
    expect(saved.body).toBe('what are you doing?');
    await expect(
      svc.postMessage(USER, { sessionId: session.id, body: '   ' } as any),
    ).rejects.toThrow('message-empty');
    expect(messages.rows).toHaveLength(1);
  });

  it('files findings with severity, commit shape and evidence', async () => {
    const { svc, findings } = makeService();
    const session = await svc.createSession(USER, {
      platform: 'web',
      goal: 'hunt for bugs',
    } as any);
    const saved = await svc.reportFinding(USER, {
      sessionId: session.id,
      severity: 4,
      title: 'Cart total doubles on refresh',
      reproSteps: ['add item', 'refresh'],
      suspectedCommit: 'abc1234',
    } as any);
    expect(saved.severity).toBe(4);
    expect(saved.suspectedCommit).toBe('abc1234');
    expect(saved.reproSteps).toEqual(['add item', 'refresh']);

    await expect(
      svc.reportFinding(USER, { sessionId: session.id, severity: 9, title: 'x' } as any),
    ).rejects.toThrow('finding-severity-invalid');
    await expect(
      svc.reportFinding(USER, {
        sessionId: session.id,
        severity: 2,
        title: 'y',
        suspectedCommit: 'ZZZ',
      } as any),
    ).rejects.toThrow('finding-commit-invalid');
    await expect(
      svc.reportFinding(USER, { sessionId: session.id, severity: 2, title: '  ' } as any),
    ).rejects.toThrow('finding-title-missing');
    expect(findings.rows).toHaveLength(1);
  });

  it('keeps sessions invisible and untouchable across users', async () => {
    const { svc } = makeService();
    const session = await svc.createSession(USER, {
      platform: 'web',
      goal: 'private session goal',
    } as any);
    await expect(
      svc.startSession(OTHER, { sessionId: session.id } as any),
    ).rejects.toThrow('session-not-found:' + session.id);
    await expect(
      svc.recordStep(OTHER, { sessionId: session.id, action: 'click', target: 'x' } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.getSession(OTHER, session.id),
    ).rejects.toThrow('session-not-found:' + session.id);
    expect(await svc.listSessions(OTHER)).toHaveLength(0);
    expect(await svc.listSessions(USER)).toHaveLength(1);
  });

  it('refuses broken goals, over-cap goals and unknown platforms by name', async () => {
    const { svc, sessions } = makeService();
    await expect(
      svc.createSession(USER, { platform: 'web', goal: '   ' } as any),
    ).rejects.toThrow('goal-empty');
    const long = Array.from({ length: 13 }, (_, i) => 'step number ' + i).join(' then ');
    await expect(svc.createSession(USER, { platform: 'web', goal: long } as any)).rejects.toThrow(
      'goal-too-many-tasks:13',
    );
    await expect(
      svc.createSession(USER, { platform: 'tv', goal: 'x goal' } as any),
    ).rejects.toThrow('platform-unknown:tv');
    expect(sessions.rows).toHaveLength(0);
  });

  it('resolves personas from the catalog and refuses unknown ones without side effects', async () => {
    const { svc, sessions } = makeService();
    await expect(
      svc.createSession(USER, { platform: 'web', goal: 'x goal', persona: 'robot' } as any),
    ).rejects.toThrow('persona-unknown:robot');
    expect(sessions.rows).toHaveLength(0);

    const withPersona = await svc.createSession(USER, {
      platform: 'web',
      goal: 'x goal',
      persona: 'screen-reader-user',
    } as any);
    expect(withPersona.persona).toBe('screen-reader-user');

    const catalog = await svc.listPersonaCatalog();
    expect(catalog.personas).toHaveLength(6);
    expect(catalog.personas).toContain('screen-reader-user');
  });

  it('gates manual control, hand back and step recording to acting sessions', async () => {
    const { svc } = makeService();
    const session = await svc.createSession(USER, {
      platform: 'web',
      goal: 'control flows check',
    } as any);
    await expect(
      svc.recordStep(USER, { sessionId: session.id, action: 'click', target: 'x' } as any),
    ).rejects.toThrow('session-not-acting:planned');
    await expect(
      svc.handBack(USER, { sessionId: session.id } as any),
    ).rejects.toThrow('session-handback-refused:planned');
    await expect(
      svc.takeControl(USER, { sessionId: session.id } as any),
    ).rejects.toThrow('session-control-refused:planned');

    await svc.startSession(USER, { sessionId: session.id } as any);
    await svc.takeControl(USER, { sessionId: session.id } as any);
    const manualStep = await svc.recordStep(USER, {
      sessionId: session.id,
      action: 'click',
      target: 'x',
    } as any);
    expect(manualStep.seq).toBe(1);
    const view = await svc.getSession(USER, session.id);
    expect(view.session.status).toBe('manual');
    expect(view.stepCount).toBe(1);

    await svc.handBack(USER, { sessionId: session.id } as any);
    const back = await svc.getSession(USER, session.id);
    expect(back.session.status).toBe('running');
  });
});
