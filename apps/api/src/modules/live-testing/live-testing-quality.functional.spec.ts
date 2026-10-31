import { BadRequestException } from '@nestjs/common';
import { LiveTestingService } from './live-testing.service';

// Functional specs for live testing quality surfaces (FORGE TQ-026..029):
// gesture testing with platform physics, creative tool testing with the
// classic undo law, audio and video output checks on ITU sync bands, and
// deterministic test account seeding with terminal-only audited cleanup.
// Everything runs through the real service against RepoDouble isolation.
// A stranger or an observer sees the same walls, and every refusal is named.

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
    return Promise.resolve(out.slice());
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

describe('live testing quality surfaces: gestures, creative tools, AV and test data', () => {
  it('records gesture steps with platform physics and deterministic narration', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'android',
      goal: 'gesture physics',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const pinch = await ctx.service.runGesture(USER, {
      sessionId: sid,
      gesture: 'pinch',
      target: 'photo viewer',
    });
    expect((pinch as any).action).toBe('pinch');
    expect((pinch as any).seq).toBe(1);
    expect((pinch as any).narration).toBe('Pinching with 2 fingers');
    expect((pinch as any).payload.contacts).toBe(2);
    const multi = await ctx.service.runGesture(USER, {
      sessionId: sid,
      gesture: 'multi-touch',
      contacts: 4,
    });
    expect((multi as any).seq).toBe(2);
    expect((multi as any).narration).toBe('Touching with 4 fingers');
    const longPress = await ctx.service.runGesture(USER, {
      sessionId: sid,
      gesture: 'long-press',
      durationMs: 1200,
    });
    expect((longPress as any).narration).toBe('Long pressing for 1200ms');
    expect(ctx.steps.rows.length).toBe(3);

    const ios = await ctx.service.createSession(USER, {
      platform: 'ios',
      goal: 'stylus work',
    });
    const iosId = (ios as any).id;
    await ctx.service.startSession(USER, { sessionId: iosId });
    const stylus = await ctx.service.runGesture(USER, {
      sessionId: iosId,
      gesture: 'stylus-pressure',
      pressure: 0.75,
    });
    expect((stylus as any).narration).toBe('Drawing with stylus at 0.75 pressure');
    expect((stylus as any).payload.pressure).toBe(0.75);
  });

  it('refuses gestures outside platform physics by name', async () => {
    const ctx = makeService();
    const web = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'web gestures',
    });
    const webId = (web as any).id;
    await ctx.service.startSession(USER, { sessionId: webId });
    expect(
      await reasonOf(() => ctx.service.runGesture(USER, { sessionId: webId, gesture: 'pinch' })),
    ).toBe('gesture-platform-unsupported:pinch:web');
    const android = await ctx.service.createSession(USER, {
      platform: 'android',
      goal: 'android gestures',
    });
    const androidId = (android as any).id;
    await ctx.service.startSession(USER, { sessionId: androidId });
    expect(
      await reasonOf(() => ctx.service.runGesture(USER, { sessionId: androidId, gesture: 'dance' })),
    ).toBe('gesture-unknown:dance');
    expect(
      await reasonOf(() => ctx.service.runGesture(USER, { sessionId: androidId, gesture: 'swipe' })),
    ).toBe('gesture-direction-missing');
    expect(
      await reasonOf(() =>
        ctx.service.runGesture(USER, { sessionId: androidId, gesture: 'stylus-pressure', pressure: 0.5 }),
      ),
    ).toBe('gesture-platform-unsupported:stylus-pressure:android');
    const planned = await ctx.service.createSession(USER, {
      platform: 'android',
      goal: 'not started',
    });
    expect(
      await reasonOf(() =>
        ctx.service.runGesture(USER, { sessionId: (planned as any).id, gesture: 'tap' }),
      ),
    ).toBe('session-not-acting:planned');
    await ctx.service.pauseSession(USER, { sessionId: androidId });
    expect(
      await reasonOf(() => ctx.service.runGesture(USER, { sessionId: androidId, gesture: 'tap' })),
    ).toBe('session-not-acting:paused');
    expect(
      await reasonOf(() => ctx.service.runGesture(OTHER, { sessionId: androidId, gesture: 'tap' })),
    ).toBe('session-not-found:' + androidId);
    expect(ctx.steps.rows.length).toBe(0);
  });

  it('gates gesture and creative steps through collaboration roles', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'android',
      goal: 'team gestures',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const observer = await ctx.service.inviteParticipant(USER, {
      sessionId: sid,
      userId: OTHER,
      role: 'observer',
    });
    await ctx.service.acceptInvitation(OTHER, { participantId: (observer as any).id });
    expect(
      await reasonOf(() => ctx.service.runGesture(OTHER, { sessionId: sid, gesture: 'tap' })),
    ).toBe('collaboration-capability-denied:observer:steps');
    expect(
      await reasonOf(() =>
        ctx.service.applyCreativeOperation(OTHER, {
          sessionId: sid,
          editor: 'manhwa',
          operation: 'draw',
        }),
      ),
    ).toBe('collaboration-capability-denied:observer:steps');
    const tester = await ctx.service.inviteParticipant(USER, {
      sessionId: sid,
      userId: THIRD,
    });
    await ctx.service.acceptInvitation(THIRD, { participantId: (tester as any).id });
    const tap = await ctx.service.runGesture(THIRD, { sessionId: sid, gesture: 'tap' });
    expect((tap as any).narration).toBe('Tapping with 1 finger');
    expect((tap as any).seq).toBe(1);
  });

  it('chains creative editor state with the classic undo law', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'creative tool flows',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const layerAdd = await ctx.service.applyCreativeOperation(USER, {
      sessionId: sid,
      editor: 'manhwa',
      operation: 'layer-add',
    });
    expect((layerAdd as any).state).toEqual({
      layers: 2,
      objects: 0,
      notes: 0,
      undoDepth: 1,
      redoDepth: 0,
    });
    const draw = await ctx.service.applyCreativeOperation(USER, {
      sessionId: sid,
      editor: 'manhwa',
      operation: 'draw',
    });
    expect((draw as any).state.undoDepth).toBe(2);
    expect((draw as any).state.redoDepth).toBe(0);
    const undo = await ctx.service.applyCreativeOperation(USER, {
      sessionId: sid,
      editor: 'manhwa',
      operation: 'undo',
    });
    expect((undo as any).state.undoDepth).toBe(1);
    expect((undo as any).state.redoDepth).toBe(1);
    expect((undo as any).step.narration).toBe('Undoing the last edit');
    const objectAdd = await ctx.service.applyCreativeOperation(USER, {
      sessionId: sid,
      editor: 'three-d',
      operation: 'object-add',
    });
    expect((objectAdd as any).state).toEqual({
      layers: 1,
      objects: 1,
      notes: 0,
      undoDepth: 1,
      redoDepth: 0,
    });
    const redo = await ctx.service.applyCreativeOperation(USER, {
      sessionId: sid,
      editor: 'manhwa',
      operation: 'redo',
    });
    expect((redo as any).state.undoDepth).toBe(2);
    expect((redo as any).state.redoDepth).toBe(0);
    expect(
      await reasonOf(() =>
        ctx.service.applyCreativeOperation(USER, {
          sessionId: sid,
          editor: 'manhwa',
          operation: 'note-place',
        }),
      ),
    ).toBe('creative-operation-unknown:note-place:manhwa');
    expect(
      await reasonOf(() =>
        ctx.service.applyCreativeOperation(USER, {
          sessionId: sid,
          editor: 'music',
          operation: 'undo',
        }),
      ),
    ).toBe('creative-undo-empty');
    expect(
      await reasonOf(() =>
        ctx.service.applyCreativeOperation(USER, {
          sessionId: sid,
          editor: 'pottery',
          operation: 'draw',
        }),
      ),
    ).toBe('creative-editor-unknown:pottery');
    expect(ctx.steps.rows.length).toBe(5);
  });

  it('checks AV playback codec law and ITU sync bands per platform', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'media checks',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const h264 = await ctx.service.checkAvPlayback(USER, {
      sessionId: sid,
      kind: 'video',
      codec: 'h264',
      target: 'hero video',
    });
    expect((h264 as any).plays).toBe(true);
    expect((h264 as any).step.narration).toBe('Checking h264 video playback on web');
    expect((h264 as any).step.payload).toEqual({ kind: 'video', codec: 'h264', plays: true });
    expect(
      await reasonOf(() =>
        ctx.service.checkAvPlayback(USER, { sessionId: sid, kind: 'video', codec: 'hevc' }),
      ),
    ).toBe('av-codec-unsupported:hevc:web');
    expect(
      await reasonOf(() =>
        ctx.service.checkAvPlayback(USER, { sessionId: sid, kind: 'video', codec: 'theora' }),
      ),
    ).toBe('av-codec-unknown:theora');
    expect(
      await reasonOf(() =>
        ctx.service.checkAvPlayback(USER, { sessionId: sid, kind: 'audio', codec: 'h264' }),
      ),
    ).toBe('av-codec-wrong-kind:h264');
    const drift = await ctx.service.checkAvSync(USER, { sessionId: sid, driftMs: 46 });
    expect((drift as any).sync).toBe('drifting');
    expect((drift as any).step.payload).toEqual({ driftMs: 46, sync: 'drifting' });
    const tight = await ctx.service.checkAvSync(USER, { sessionId: sid, driftMs: 0 });
    expect((tight as any).sync).toBe('in-sync');
    const broken = await ctx.service.checkAvSync(USER, { sessionId: sid, driftMs: -200 });
    expect((broken as any).sync).toBe('out-of-sync');
    expect(
      await reasonOf(() => ctx.service.checkAvSync(USER, { sessionId: sid } as any)),
    ).toBe('av-drift-missing');
  });

  it('walks the media state machine and refuses illegal transitions', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'state machine',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const play = await ctx.service.runAvTransition(USER, {
      sessionId: sid,
      from: 'idle',
      to: 'playing',
    });
    expect((play as any).step.narration).toBe('Media moves from idle to playing');
    const pause = await ctx.service.runAvTransition(USER, {
      sessionId: sid,
      from: 'playing',
      to: 'paused',
    });
    expect((pause as any).to).toBe('paused');
    expect(
      await reasonOf(() =>
        ctx.service.runAvTransition(USER, { sessionId: sid, from: 'idle', to: 'paused' }),
      ),
    ).toBe('av-state-refused:idle:paused');
    expect(
      await reasonOf(() =>
        ctx.service.runAvTransition(USER, { sessionId: sid, from: 'idle', to: 'warp' }),
      ),
    ).toBe('av-state-unknown:warp');
    expect(
      await reasonOf(() =>
        ctx.service.checkAvPlayback(OTHER, { sessionId: sid, kind: 'video', codec: 'h264' }),
      ),
    ).toBe('session-not-found:' + sid);
    expect(ctx.steps.rows.length).toBe(2);
  });

  it('seeds deterministic test accounts on the fixture domain', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'seed and clean',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    const seeded = await ctx.service.seedTestAccounts(USER, { sessionId: sid, count: 2 });
    const accounts = (seeded as any).accounts;
    expect(accounts.length).toBe(2);
    expect(accounts[0].email).toBe(accounts[0].username + '@forgelocal.test');
    expect(accounts[1].email.endsWith('@forgelocal.test')).toBe(true);
    expect(accounts[0].role).toBe('shopper');
    expect(accounts[1].role).toBe('editor');
    expect(accounts[0].state).toBe('created');
    expect((seeded as any).step.narration).toBe('Seeding 2 test accounts');
    expect((seeded as any).step.payload).toEqual({ count: 2, domain: 'forgelocal.test' });
    const listed = await ctx.service.listSessionAccounts(USER, { sessionId: sid });
    expect((listed as any).accounts.length).toBe(2);
    expect(
      await reasonOf(() => ctx.service.seedTestAccounts(USER, { sessionId: sid })),
    ).toBe('data-already-seeded:2');
    expect(
      await reasonOf(() => ctx.service.seedTestAccounts(USER, { sessionId: sid, count: 13 })),
    ).toBe('data-already-seeded:2');
    const fresh = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'default seeding',
    });
    const freshId = (fresh as any).id;
    await ctx.service.startSession(USER, { sessionId: freshId });
    const defaulted = await ctx.service.seedTestAccounts(USER, { sessionId: freshId });
    expect((defaulted as any).accounts.length).toBe(3);
    expect((defaulted as any).accounts[2].role).toBe('viewer');
    expect(
      await reasonOf(() => ctx.service.seedTestAccounts(USER, { sessionId: freshId, count: 13 })),
    ).toBe('data-already-seeded:3');
    const countSession = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'count refusal',
    });
    const countId = (countSession as any).id;
    await ctx.service.startSession(USER, { sessionId: countId });
    expect(
      await reasonOf(() => ctx.service.seedTestAccounts(USER, { sessionId: countId, count: 13 })),
    ).toBe('data-count-invalid:13');
    expect(
      await reasonOf(() => ctx.service.seedTestAccounts(OTHER, { sessionId: freshId })),
    ).toBe('session-not-found:' + freshId);
  });

  it('cleans up test data only on terminal sessions and stays idempotent', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'cleanup law',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    await ctx.service.seedTestAccounts(USER, { sessionId: sid, count: 2 });
    expect(
      await reasonOf(() => ctx.service.cleanupSessionData(USER, { sessionId: sid })),
    ).toBe('data-cleanup-status-refused:running');
    await ctx.service.completeSession(USER, { sessionId: sid });
    const cleaned = await ctx.service.cleanupSessionData(USER, { sessionId: sid });
    expect((cleaned as any).alreadyClean).toBe(false);
    expect((cleaned as any).plan).toEqual([
      'disable fixtures',
      'purge seeded uploads',
      'restore app settings',
      'remove test accounts',
    ]);
    expect((cleaned as any).cleanedIds.length).toBe(2);
    expect((cleaned as any).step.narration).toBe('Cleaning up 2 seeded test accounts');
    expect(
      ctx.accounts.rows.every(
        (r: any) => r.state === 'cleaned' && r.cleanedAt instanceof Date,
      ),
    ).toBe(true);
    const again = await ctx.service.cleanupSessionData(USER, { sessionId: sid });
    expect((again as any).alreadyClean).toBe(true);
    expect((again as any).plan).toEqual([]);
    expect(ctx.steps.rows.length).toBe(2);
  });

  it('keeps seeded test data invisible and untouchable across users', async () => {
    const ctx = makeService();
    const created = await ctx.service.createSession(USER, {
      platform: 'web',
      goal: 'private fixtures',
    });
    const sid = (created as any).id;
    await ctx.service.startSession(USER, { sessionId: sid });
    await ctx.service.seedTestAccounts(USER, { sessionId: sid, count: 1 });
    expect(
      await reasonOf(() => ctx.service.listSessionAccounts(OTHER, { sessionId: sid })),
    ).toBe('session-not-found:' + sid);
    expect(
      await reasonOf(() => ctx.service.cleanupSessionData(OTHER, { sessionId: sid })),
    ).toBe('session-not-found:' + sid);
    expect((ctx.accounts.rows as any[]).length).toBe(1);
    expect((ctx.accounts.rows[0] as any).state).toBe('created');
  });

  it('pins the gesture, creative and AV catalogs', async () => {
    const ctx = makeService();
    const iosGestures = await ctx.service.listGestureCatalog('ios');
    expect((iosGestures as any).gestures.map((g: any) => g.gesture)).toEqual([
      'tap',
      'swipe',
      'long-press',
      'pinch',
      'rotate',
      'multi-touch',
      'stylus-pressure',
    ]);
    const webGestures = await ctx.service.listGestureCatalog('web');
    expect((webGestures as any).gestures).toEqual([]);
    const editors = await ctx.service.listCreativeCatalog();
    expect((editors as any).editors.manhwa).toContain('layer-merge');
    expect((editors as any).editors['three-d']).toContain('camera-orbit');
    expect((editors as any).editors.music).toContain('note-place');
    expect((editors as any).editors.manhwa).toContain('undo');
    expect((editors as any).editors.manhwa).toContain('redo');
    const webCodecs = await ctx.service.listAvCatalog('web');
    expect((webCodecs as any).video).toEqual(['h264', 'vp9', 'av1']);
    expect((webCodecs as any).audio).toEqual(['aac', 'opus', 'mp3']);
    const androidCodecs = await ctx.service.listAvCatalog('android');
    expect((androidCodecs as any).video).toEqual(['h264', 'hevc']);
  });
});
