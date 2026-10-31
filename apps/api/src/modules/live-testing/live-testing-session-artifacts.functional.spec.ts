import { BadRequestException } from '@nestjs/common';
import { LiveTestingService } from './live-testing.service';

// Functional specs for live testing session artifacts (FORGE TQ-014..021):
// session recordings, auto bug reports, one-click test conversion, the
// device and network catalog, and custom personas, all through the real
// service against RepoDouble isolation. Cross-user access is a uniform
// not-found refusal, never a leak, and every refusal is named.

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

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
    const order = opts?.order;
    if (order) {
      const entries = Object.entries(order);
      out.sort((a, b) => {
        for (const entry of entries) {
          const field = entry[0];
          const dir = entry[1];
          if (a[field] < b[field]) {
            return dir === 'DESC' ? 1 : -1;
          }
          if (a[field] > b[field]) {
            return dir === 'DESC' ? -1 : 1;
          }
        }
        return 0;
      });
    }
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
  const accounts = new RepoDouble();
  const service = new LiveTestingService(
    sessions as any,
    steps as any,
    messages as any,
    findings as any,
    personas as any,
    participants as any,
    accounts as any,
  );
  return { sessions, steps, messages, findings, personas, participants, accounts, service };
}

async function reasonOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'no-refusal';
  } catch (e) {
    return e instanceof BadRequestException ? e.message : 'wrong-error';
  }
}

describe('live testing session artifacts and custom personas', () => {
  it('pins the recording timeline and refuses unstarted sessions', async () => {
    const ctx = makeService();
    ctx.sessions.rows.push({
      id: 'sess-rec',
      userId: USER,
      workspace: 'default',
      status: 'running',
      platform: 'web',
      environment: 'staging',
      safeMode: true,
      startedAt: null,
    });
    expect(await reasonOf(() => ctx.service.buildRecording(USER, 'sess-rec'))).toBe(
      'recording-not-started',
    );
    expect(await reasonOf(() => ctx.service.buildRecording(OTHER, 'sess-rec'))).toBe(
      'session-not-found:sess-rec',
    );
    const t0 = new Date('2026-10-31T10:00:00.000Z');
    const row = ctx.sessions.rows[0];
    row.startedAt = t0;
    ctx.steps.rows.push({
      sessionId: 'sess-rec',
      seq: 1,
      narration: 'Opening the product page',
      status: 'recorded',
      occurredAt: new Date(t0.getTime() + 1000),
    });
    ctx.steps.rows.push({
      sessionId: 'sess-rec',
      seq: 2,
      narration: 'Adding the mug to the cart',
      status: 'recorded',
      occurredAt: new Date(t0.getTime() + 2500),
    });
    const out = await ctx.service.buildRecording(USER, 'sess-rec');
    const events = out.events ?? [];
    expect(events.length).toBe(2);
    expect(events[0]).toEqual({
      id: 'event-1',
      offsetMs: 1000,
      kind: 'step',
      label: 'Opening the product page',
    });
    expect(events[1].offsetMs).toBe(2500);
    expect(out.durationMs).toBe(2500);
  });

  it('records steps with timestamps and replays one timeline event per step', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      goal: 'purchase a red mug',
      platform: 'web',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    await ctx.service.recordStep(USER, {
      sessionId: sid,
      action: 'click',
      target: 'cart icon',
    });
    await ctx.service.recordStep(USER, {
      sessionId: sid,
      action: 'type',
      target: 'search box',
      value: 'red mug',
    });
    const out = await ctx.service.buildRecording(USER, sid);
    const events = out.events ?? [];
    expect(events.length).toBe(2);
    expect(events[0].kind).toBe('step');
    expect(events[1].kind).toBe('step');
    expect(typeof out.durationMs).toBe('number');
    expect(ctx.steps.rows.length).toBe(2);
    expect((ctx.steps.rows[1] as any).occurredAt).toBeInstanceOf(Date);
  });

  it('expands the newest finding into a shareable bug report', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      goal: 'purchase a red mug',
      platform: 'web',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    await ctx.service.recordStep(USER, {
      sessionId: sid,
      action: 'click',
      target: 'cart icon',
    });
    await ctx.service.reportFinding(USER, {
      sessionId: sid,
      severity: 5,
      title: 'Cart   total WRONG',
      reproSteps: ['Total shows 0 after adding two items.'],
      evidence: { shot: 'a.png' },
      suspectedCommit: 'a1b2c3d',
    });
    const out = await ctx.service.assembleBugReportForSession(USER, sid);
    const report = out.report;
    expect(report?.severityLabel).toBe('blocker');
    expect(report?.title).toBe('Cart   total WRONG');
    expect(report?.environmentLine).toBe('platform web, environment staging, safe mode on');
    expect(report?.dedupeKey).toBe(sid + '|5|cart total wrong');
    expect(report?.suspectedCommit).toBe('a1b2c3d');
    expect(report?.evidence).toBe('{"shot":"a.png"}');
    const lines = report?.reproLines ?? [];
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('Clicking cart icon');
    expect(lines[1]).toBe('Total shows 0 after adding two items.');
  });

  it('refuses bug reports for sessions without findings', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      goal: 'browse the shop',
      platform: 'web',
    });
    const sid = (created as any).id;
    expect(
      await reasonOf(() => ctx.service.assembleBugReportForSession(USER, sid)),
    ).toBe('bugreport-none');
  });

  it('converts a session into a deterministic replayable test case', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      goal: 'purchase a red mug',
      platform: 'web',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    await ctx.service.recordStep(USER, {
      sessionId: sid,
      action: 'click',
      target: 'red mug card',
    });
    await ctx.service.recordStep(USER, {
      sessionId: sid,
      action: 'click',
      target: 'the checkout lane',
    });
    await ctx.service.recordStep(USER, {
      sessionId: sid,
      action: 'click',
      target: 'pay button',
    });
    const out = await ctx.service.convertSessionForUser(USER, sid);
    expect(out.testCase?.name).toBe('purchase a red mug');
    expect(out.testCase?.caseSteps).toEqual([
      { id: 'case-1', line: 'click red mug card' },
      { id: 'case-2', line: 'click the checkout lane' },
      { id: 'case-3', line: 'click pay button' },
    ]);
    expect(out.testCase?.expected).toBe('All 3 steps replay in the same order');

    const empty = await ctx.service.createSession(USER, {
      goal: 'browse the shop',
      platform: 'web',
    });
    const emptyId = (empty as any).id;
    expect(await reasonOf(() => ctx.service.convertSessionForUser(USER, emptyId))).toBe(
      'conversion-empty',
    );
  });

  it('pins the device and network catalog surface', async () => {
    const ctx = makeService();
    const out = await ctx.service.listDeviceCatalog();
    expect(out.devices.length).toBe(12);
    expect(out.networks.length).toBe(6);
    const lowEnd = out.devices.find((d: any) => d.device === 'low-end-android');
    expect(lowEnd?.lowEnd).toBe(true);
    expect(lowEnd?.cpuThrottle).toBe(4);
    const offline = out.networks.find((n: any) => n.network === 'offline');
    expect(offline?.offline).toBe(true);
    expect(offline?.downlinkKbps).toBe(0);
    expect(offline?.latencyMs).toBe(0);
  });

  it('runs the custom persona lifecycle with named refusals', async () => {
    const ctx = makeService();
    const made = await ctx.service.createPersona(USER, {
      name: '  Night-Owl  ',
      traits: ['nocturnal'],
      checklist: ['dim the lights'],
      paceMultiplier: 1.5,
    });
    expect((made as any).name).toBe('night-owl');
    expect((made as any).workspace).toBe('default');
    expect((made as any).paceMultiplier).toBe(1.5);
    expect((made as any).traits).toEqual(['nocturnal']);
    expect((made as any).checklist).toEqual(['dim the lights']);
    expect(
      await reasonOf(() => ctx.service.createPersona(USER, { name: 'night-owl' })),
    ).toBe('persona-duplicate:night-owl');
    expect(
      await reasonOf(() => ctx.service.createPersona(USER, { name: 'power-user' })),
    ).toBe('persona-duplicate:power-user');
    expect(
      await reasonOf(() =>
        ctx.service.createPersona(USER, { name: 'turbo', paceMultiplier: 9 }),
      ),
    ).toBe('persona-pace-invalid');
    expect(await reasonOf(() => ctx.service.createPersona(USER, { name: '   ' }))).toBe(
      'persona-name-missing',
    );
  });

  it('keeps custom personas user-scoped and workspace-scoped', async () => {
    const ctx = makeService();
    const mine = await ctx.service.createPersona(USER, { name: 'night-owl' });
    const theirs = await ctx.service.createPersona(OTHER, { name: 'night-owl' });
    const theirsId = (theirs as any).id;
    const mineList = await ctx.service.listCustomPersonas(USER);
    expect(mineList.length).toBe(1);
    expect((mineList[0] as any).id).toBe((mine as any).id);
    const otherWs = await ctx.service.listCustomPersonas(USER, 'other-ws');
    expect(otherWs.length).toBe(0);
    expect(
      await reasonOf(() => ctx.service.deletePersona(USER, { personaId: theirsId })),
    ).toBe('persona-not-found:' + theirsId);
    const removed = await ctx.service.deletePersona(OTHER, { personaId: theirsId });
    expect(removed).toEqual({ deleted: true, id: theirsId });
    expect(
      await reasonOf(() => ctx.service.deletePersona(OTHER, { personaId: theirsId })),
    ).toBe('persona-not-found:' + theirsId);
    expect(ctx.personas.rows.length).toBe(1);
  });

  it('accepts custom personas in sessions and refuses unknown ones', async () => {
    const ctx = makeService();
    await ctx.service.createPersona(USER, { name: 'vintage-shopper' });
    const withCustom = await ctx.service.createSession(USER, {
      goal: 'browse the vintage catalog',
      platform: 'web',
      persona: 'vintage-shopper',
    });
    expect((withCustom as any).persona).toBe('vintage-shopper');
    expect(
      await reasonOf(() =>
        ctx.service.createSession(USER, {
          goal: 'browse the catalog',
          platform: 'web',
          persona: 'robot',
        }),
      ),
    ).toBe('persona-unknown:robot');
    expect(
      await reasonOf(() =>
        ctx.service.createSession(OTHER, {
          goal: 'browse the catalog',
          platform: 'web',
          persona: 'vintage-shopper',
        }),
      ),
    ).toBe('persona-unknown:vintage-shopper');
  });
});
