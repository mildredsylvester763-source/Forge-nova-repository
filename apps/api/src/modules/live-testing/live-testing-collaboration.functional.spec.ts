import { BadRequestException } from '@nestjs/common';
import { LiveTestingService } from './live-testing.service';

// Functional specs for live testing collaboration (FORGE TQ-022..025):
// interruption simulation, permission plans, multi-user sessions with
// owner/tester/observer roles, invitation and revocation law, and
// cross-device handoffs. Everything runs through the real service against
// RepoDouble isolation. A stranger or a revoked participant sees the same
// session-not-found wall, and every refusal is named.

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';

let rowSeq = 0;
function nextRowSeq(): number {
  rowSeq += 1;
  return rowSeq;
}

class RepoDouble {
  rows: any[] = [];

  find(opts: any): Promise<any[]> {
    const where = opts?.where ?? {};
    const out = this.rows.filter((r) =>
      Object.keys(where).every((k) => r[k] === where[k]),
    );
    return Promise.resolve(opts?.take ? out.slice(0, opts.take) : out.slice());
  }

  findOne(opts: any): Promise<any> {
    const where = opts?.where ?? {};
    const row = this.rows.find((r) =>
      Object.keys(where).every((k) => r[k] === where[k]),
    );
    return Promise.resolve(row === undefined ? null : row);
  }

  create(data: any) {
    return { ...data };
  }

  save(data: any): Promise<any> {
    if (!data.id) {
      data.id = 'row-' + String(nextRowSeq());
      this.rows.push(data);
    }
    return Promise.resolve(data);
  }

  remove(row: any): Promise<any> {
    this.rows = this.rows.filter((r) => r !== row);
    return Promise.resolve(row);
  }
}

function makeService() {
  const sessions = new RepoDouble();
  const steps = new RepoDouble();
  const messages = new RepoDouble();
  const findings = new RepoDouble();
  const personas = new RepoDouble();
  const participants = new RepoDouble();
  const service = new LiveTestingService(
    sessions as any,
    steps as any,
    messages as any,
    findings as any,
    personas as any,
    participants as any,
  );
  return { sessions, steps, messages, findings, personas, participants, service };
}

async function reasonOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'no-refusal';
  } catch (e) {
    return e instanceof BadRequestException ? e.message : 'wrong-error';
  }
}

describe('live testing collaboration, interruptions, permissions and handoffs', () => {
  it('simulates a manual-resume interruption that auto-pauses the session', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'android',
      goal: 'test checkout under fire',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const out = await ctx.service.simulateInterruption(USER, {
      sessionId: sid,
      scenario: 'incoming-call',
    });
    expect((out.step as any).action).toBe('interrupt');
    expect((out.step as any).seq).toBe(1);
    expect((out.step as any).narration).toBe('Interrupting the session with Incoming call');
    expect((out.step as any).payload.scenario).toBe('incoming-call');
    expect(out.resume).toBe('manual');
    expect(out.dataLossRisk).toBe(true);
    expect((out.session as any).status).toBe('paused');
    expect(ctx.steps.rows.length).toBe(1);
  });

  it('refuses illegal interruptions by name and keeps immediate-resume sessions running', async () => {
    const ctx = makeService();
    const web = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'interrupt the web app',
    });
    const webId = (web as any).id;
    await ctx.service.startSession(USER, { sessionId: webId });
    expect(
      await reasonOf(() =>
        ctx.service.simulateInterruption(USER, { sessionId: webId, scenario: 'incoming-call' }),
      ),
    ).toBe('interruption-platform-unsupported:incoming-call:web');
    expect(
      await reasonOf(() =>
        ctx.service.simulateInterruption(USER, { sessionId: webId, scenario: 'earthquake' }),
      ),
    ).toBe('interruption-unknown:earthquake');
    const planned = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'not started yet',
    });
    expect(
      await reasonOf(() =>
        ctx.service.simulateInterruption(USER, {
          sessionId: (planned as any).id,
          scenario: 'push-notification',
        }),
      ),
    ).toBe('interruption-session-not-running:planned');
    expect(
      await reasonOf(() =>
        ctx.service.simulateInterruption(OTHER, { sessionId: webId, scenario: 'push-notification' }),
      ),
    ).toBe('session-not-found:' + webId);
    const out = await ctx.service.simulateInterruption(USER, {
      sessionId: webId,
      scenario: 'push-notification',
    });
    expect(out.resume).toBe('immediate');
    expect((out.session as any).status).toBe('running');
    expect(ctx.steps.rows.length).toBe(1);
  });

  it('pins the interruption catalog per platform', async () => {
    const ctx = makeService();
    const all = await ctx.service.listInterruptionCatalog();
    expect(all.scenarios.length).toBe(7);
    const web = await ctx.service.listInterruptionCatalog('web');
    expect(web.scenarios.length).toBe(2);
    expect(web.scenarios.map((s: any) => s.scenario)).toEqual([
      'push-notification',
      'network-drop',
    ]);
  });

  it('applies a permission plan as an audited step with granted denied ask counts', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'permission flows',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const out = await ctx.service.applyPermissionPlan(USER, {
      sessionId: sid,
      grants: [
        { permission: 'camera', state: 'granted' },
        { permission: 'location', state: 'denied' },
      ],
    });
    expect((out.step as any).action).toBe('permissions');
    expect((out.step as any).narration).toBe('Applying permission plan with 2 entries');
    expect((out.step as any).payload.grants).toEqual([
      { permission: 'camera', state: 'granted' },
      { permission: 'location', state: 'denied' },
    ]);
    expect(out.granted).toBe(1);
    expect(out.denied).toBe(1);
    expect(out.ask).toBe(0);
    expect(ctx.steps.rows.length).toBe(1);
  });

  it('refuses broken permission plans by name', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'permission flows',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    expect(
      await reasonOf(() =>
        ctx.service.applyPermissionPlan(USER, {
          sessionId: sid,
          grants: [{ permission: 'storage', state: 'granted' }],
        }),
      ),
    ).toBe('permission-unknown:storage:web');
    expect(
      await reasonOf(() =>
        ctx.service.applyPermissionPlan(USER, {
          sessionId: sid,
          grants: [{ permission: 'camera', state: 'blocked' }],
        }),
      ),
    ).toBe('permission-state-not-planable:blocked');
    expect(
      await reasonOf(() =>
        ctx.service.applyPermissionPlan(USER, {
          sessionId: sid,
          grants: [
            { permission: 'camera', state: 'granted' },
            { permission: 'camera', state: 'denied' },
          ],
        }),
      ),
    ).toBe('permission-duplicate:camera');
    expect(
      await reasonOf(() => ctx.service.applyPermissionPlan(USER, { sessionId: sid, grants: [] })),
    ).toBe('permission-plan-empty');
    expect(
      await reasonOf(() =>
        ctx.service.applyPermissionPlan(USER, { sessionId: sid, grants: 'camera' as any }),
      ),
    ).toBe('permission-plan-not-array');
    const done = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'already finished',
    });
    const doneId = (done as any).id;
    await ctx.service.startSession(USER, { sessionId: doneId });
    await ctx.service.completeSession(USER, { sessionId: doneId });
    expect(
      await reasonOf(() =>
        ctx.service.applyPermissionPlan(USER, {
          sessionId: doneId,
          grants: [{ permission: 'camera', state: 'granted' }],
        }),
      ),
    ).toBe('permission-session-terminal:completed');
  });

  it('invites, accepts and enforces tester and observer roles', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'multi user session',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const invited = await ctx.service.inviteParticipant(USER, { sessionId: sid, userId: OTHER });
    expect((invited as any).role).toBe('tester');
    expect((invited as any).state).toBe('invited');
    expect((invited as any).invitedBy).toBe(USER);
    expect(
      await reasonOf(() =>
        ctx.service.recordStep(OTHER, { sessionId: sid, action: 'click', target: 'x' }),
      ),
    ).toBe('session-not-found:' + sid);
    const accepted = await ctx.service.acceptInvitation(OTHER, {
      participantId: (invited as any).id,
    });
    expect((accepted as any).state).toBe('active');
    const step = await ctx.service.recordStep(OTHER, {
      sessionId: sid,
      action: 'click',
      target: 'add to cart button',
    });
    expect((step as any).narration).toBe('Clicking add to cart button');
    expect((step as any).seq).toBe(1);
    expect((step as any).actor).toBe('ai');
    const msg = await ctx.service.postMessage(OTHER, { sessionId: sid, body: 'checking in' });
    expect((msg as any).role).toBe('human');
    expect(ctx.participants.rows.length).toBe(1);
    const observer = await ctx.service.inviteParticipant(USER, {
      sessionId: sid,
      userId: THIRD,
      role: 'observer',
    });
    await ctx.service.acceptInvitation(THIRD, { participantId: (observer as any).id });
    expect(
      await reasonOf(() =>
        ctx.service.recordStep(THIRD, { sessionId: sid, action: 'click', target: 'x' }),
      ),
    ).toBe('collaboration-capability-denied:observer:steps');
    const watching = await ctx.service.postMessage(THIRD, { sessionId: sid, body: 'watching' });
    expect((watching as any).body).toBe('watching');
    expect(ctx.steps.rows.length).toBe(1);
  });

  it('refuses broken invitations by name', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'invitation law',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    expect(
      await reasonOf(() => ctx.service.inviteParticipant(USER, { sessionId: sid, userId: USER })),
    ).toBe('collaboration-self-invite');
    expect(
      await reasonOf(() =>
        ctx.service.inviteParticipant(USER, { sessionId: sid, userId: OTHER, role: 'boss' }),
      ),
    ).toBe('collaboration-role-unknown:boss');
    expect(
      await reasonOf(() =>
        ctx.service.inviteParticipant(USER, { sessionId: sid, userId: '   ' }),
      ),
    ).toBe('collaboration-user-missing');
    const invited = await ctx.service.inviteParticipant(USER, { sessionId: sid, userId: OTHER });
    expect(
      await reasonOf(() =>
        ctx.service.inviteParticipant(USER, { sessionId: sid, userId: OTHER }),
      ),
    ).toBe('collaboration-participant-duplicate:' + OTHER);
    expect(
      await reasonOf(() =>
        ctx.service.acceptInvitation(USER, { participantId: (invited as any).id }),
      ),
    ).toBe('participant-not-found:' + (invited as any).id);
    await ctx.service.acceptInvitation(OTHER, { participantId: (invited as any).id });
    expect(
      await reasonOf(() =>
        ctx.service.acceptInvitation(OTHER, { participantId: (invited as any).id }),
      ),
    ).toBe('collaboration-state-invalid:active:accept');
    expect(ctx.participants.rows.length).toBe(1);
    const done = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'finished session',
    });
    const doneId = (done as any).id;
    await ctx.service.startSession(USER, { sessionId: doneId });
    await ctx.service.completeSession(USER, { sessionId: doneId });
    expect(
      await reasonOf(() =>
        ctx.service.inviteParticipant(USER, { sessionId: doneId, userId: OTHER }),
      ),
    ).toBe('collaboration-session-terminal:completed');
  });

  it('revokes participants, seals access and stays owner-only', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'revocation law',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const tester = await ctx.service.inviteParticipant(USER, { sessionId: sid, userId: OTHER });
    await ctx.service.acceptInvitation(OTHER, { participantId: (tester as any).id });
    const observer = await ctx.service.inviteParticipant(USER, {
      sessionId: sid,
      userId: THIRD,
      role: 'observer',
    });
    await ctx.service.acceptInvitation(THIRD, { participantId: (observer as any).id });
    expect(
      await reasonOf(() =>
        ctx.service.revokeParticipant(THIRD, { participantId: (tester as any).id }),
      ),
    ).toBe('session-not-found:' + sid);
    const revoked = await ctx.service.revokeParticipant(USER, {
      participantId: (tester as any).id,
    });
    expect(revoked).toEqual({ deleted: true, id: (tester as any).id });
    expect(
      await reasonOf(() =>
        ctx.service.recordStep(OTHER, { sessionId: sid, action: 'click', target: 'x' }),
      ),
    ).toBe('session-not-found:' + sid);
    expect(
      await reasonOf(() =>
        ctx.service.revokeParticipant(USER, { participantId: (tester as any).id }),
      ),
    ).toBe('participant-not-found:' + (tester as any).id);
    const list = await ctx.service.listParticipants(USER, { sessionId: sid });
    expect(list.participants.length).toBe(1);
    expect((list.participants[0] as any).userId).toBe(THIRD);
  });

  it('hands sessions off across devices and platforms with audit steps', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'cross device journey',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const first = await ctx.service.handoffSession(USER, { sessionId: sid, device: 'iphone-13' });
    expect(first.handoff?.initial).toBe(true);
    expect(first.handoff?.platformChanged).toBe(true);
    expect(first.handoff?.resume).toBe('automatic');
    expect(first.handoff?.goalPreserved).toBe(true);
    expect((first.session as any).deviceProfile).toEqual({
      device: 'iphone-13',
      platform: 'ios',
      lowEnd: false,
      cpuThrottle: 1,
    });
    expect((first.step as any).action).toBe('handoff');
    expect((first.step as any).seq).toBe(1);
    expect((first.step as any).narration).toBe('Handing off to iphone-13 across platforms');
    const second = await ctx.service.handoffSession(USER, { sessionId: sid, device: 'ipad-9' });
    expect(second.handoff?.fromDevice).toBe('iphone-13');
    expect(second.handoff?.platformChanged).toBe(false);
    expect((second.step as any).narration).toBe('Handing off to ipad-9');
    expect((second.step as any).seq).toBe(2);
    expect(
      await reasonOf(() => ctx.service.handoffSession(USER, { sessionId: sid, device: 'ipad-9' })),
    ).toBe('handoff-same-device');
    expect(
      await reasonOf(() =>
        ctx.service.handoffSession(USER, { sessionId: sid, device: 'fridge-os' }),
      ),
    ).toBe('handoff-device-unknown:fridge-os');
    const planned = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'not started',
    });
    expect(
      await reasonOf(() =>
        ctx.service.handoffSession(USER, { sessionId: (planned as any).id, device: 'iphone-13' }),
      ),
    ).toBe('handoff-state-invalid:planned');
    expect(
      await reasonOf(() =>
        ctx.service.handoffSession(OTHER, { sessionId: sid, device: 'iphone-13' }),
      ),
    ).toBe('session-not-found:' + sid);
  });

  it('pins the collaboration role catalog', async () => {
    const ctx = makeService();
    const out = await ctx.service.listRoleCatalog();
    expect(out.roles.length).toBe(3);
    expect(out.roles[0]).toEqual({
      role: 'owner',
      capabilities: ['lifecycle', 'steps', 'messages', 'findings', 'control'],
    });
    expect(out.roles[2]).toEqual({ role: 'observer', capabilities: ['messages'] });
  });
});
