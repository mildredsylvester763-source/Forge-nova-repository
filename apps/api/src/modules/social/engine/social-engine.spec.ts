import {
  planCancelPost,
  planSchedulePost,
  validatePlatforms,
  validatePostText,
} from './social-engine';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The sweep oracle recomputes every verdict with independent set logic,
// a different path from the engine loop, and compares full results.

describe('social-engine (pinned vectors)', () => {
  it('validates text and platforms by name', () => {
    expect(validatePostText('  Hello world  ')).toEqual({ ok: true, value: 'Hello world' });
    expect(validatePostText('x'.repeat(63207))).toEqual({ ok: false, reason: 'social-invalid-text' });
    expect(validatePostText('   ')).toEqual({ ok: false, reason: 'social-invalid-text' });
    expect(validatePlatforms([])).toEqual({ ok: false, reason: 'social-needs-platforms' });
    expect(validatePlatforms(['nope'])).toEqual({ ok: false, reason: 'social-invalid-platform' });
    expect(validatePlatforms(['x', 'x', 'facebook'])).toEqual({
      ok: true,
      value: ['facebook', 'x'],
    });
  });

  it('schedules ahead inside a one year window, refusing by name', () => {
    const ok = planSchedulePost({
      rawText: 'Hello',
      rawPlatforms: ['facebook'],
      nowMs: 1000,
      scheduledAtMs: 2000,
    });
    expect(ok).toEqual({
      ok: true,
      value: { text: 'Hello', platforms: ['facebook'], scheduledAtMs: 2000 },
    });
    expect(
      planSchedulePost({ rawText: 'Hello', rawPlatforms: [], nowMs: 1000, scheduledAtMs: 2000 }),
    ).toEqual({ ok: false, reason: 'social-needs-platforms' });
    expect(
      planSchedulePost({ rawText: 'Hello', rawPlatforms: ['facebook'], nowMs: 1000, scheduledAtMs: 1000 }),
    ).toEqual({ ok: false, reason: 'social-invalid-scheduled-at' });
    expect(
      planSchedulePost({
        rawText: 'Hello',
        rawPlatforms: ['facebook'],
        nowMs: 1000,
        scheduledAtMs: 1000 + 365 * 24 * 3600 * 1000 + 1,
      }),
    ).toEqual({ ok: false, reason: 'social-schedule-too-far' });
    expect(
      planSchedulePost({
        rawText: 'Hello',
        rawPlatforms: ['facebook'],
        nowMs: 1000,
        scheduledAtMs: 1000 + 365 * 24 * 3600 * 1000,
      }).ok,
    ).toBe(true);
    expect(
      planSchedulePost({ rawText: 'y'.repeat(281), rawPlatforms: ['x'], nowMs: 1000, scheduledAtMs: 2000 }),
    ).toEqual({ ok: false, reason: 'social-text-too-long-for-x' });
    expect(
      planSchedulePost({ rawText: 'y'.repeat(501), rawPlatforms: ['facebook', 'threads'], nowMs: 1000, scheduledAtMs: 2000 }),
    ).toEqual({ ok: false, reason: 'social-text-too-long-for-threads' });
  });

  it('cancels once and refuses anything else by name', () => {
    expect(planCancelPost('scheduled')).toEqual({ ok: true, value: 'cancelled' });
    expect(planCancelPost('cancelled')).toEqual({ ok: false, reason: 'social-already-cancelled' });
    expect(planCancelPost('weird')).toEqual({ ok: false, reason: 'social-invalid-state' });
  });
});

describe('social-engine (500-case sweep, seed 42)', () => {
  it('schedule verdicts match an independent set-based oracle', () => {
    const rng = mulberry32(42);
    const names = ['facebook', 'instagram', 'tiktok', 'linkedin', 'x', 'threads', 'bluesky', 'mastodon'];
    const limits: Record<string, number> = {
      facebook: 63206,
      instagram: 2200,
      tiktok: 2200,
      linkedin: 3000,
      x: 280,
      threads: 500,
      bluesky: 300,
      mastodon: 500,
    };
    const maxAhead = 365 * 24 * 3600 * 1000;
    for (let i = 0; i < 500; i += 1) {
      const len = Math.floor(rng() * 700);
      const rawText = rng() < 0.9 ? 'a'.repeat(len) : null;
      const platformCount = Math.floor(rng() * 4);
      const rawPlatforms: unknown[] = [];
      for (let j = 0; j < platformCount; j += 1) {
        rawPlatforms.push(rng() < 0.85 ? names[Math.floor(rng() * names.length)] : 'nope-' + j);
      }
      const nowMs = 1700000000000;
      const roll = rng();
      const scheduledAtMs: unknown =
        roll < 0.3
          ? nowMs - Math.floor(rng() * 100000)
          : roll < 0.5
            ? nowMs
            : roll < 0.8
              ? nowMs + 1 + Math.floor(rng() * maxAhead)
              : nowMs + maxAhead + 1 + Math.floor(rng() * 1000);
      const verdict = planSchedulePost({ rawText, rawPlatforms, nowMs, scheduledAtMs });

      let expected: unknown;
      if (rawText === null || String(rawText).trim().length < 1) {
        expected = { ok: false, reason: 'social-invalid-text' };
      } else if (rawPlatforms.length < 1) {
        expected = { ok: false, reason: 'social-needs-platforms' };
      } else if (rawPlatforms.some((p) => typeof p !== 'string' || !(p in limits))) {
        expected = { ok: false, reason: 'social-invalid-platform' };
      } else if (typeof scheduledAtMs !== 'number' || !Number.isInteger(scheduledAtMs) || scheduledAtMs <= nowMs) {
        expected = { ok: false, reason: 'social-invalid-scheduled-at' };
      } else if (scheduledAtMs - nowMs > maxAhead) {
        expected = { ok: false, reason: 'social-schedule-too-far' };
      } else {
        const uniq = [...new Set(rawPlatforms as string[])].sort();
        const worst = uniq.find((p) => String(rawText).trim().length > limits[p]);
        expected = worst
          ? { ok: false, reason: 'social-text-too-long-for-' + worst }
          : { ok: true, value: { text: String(rawText).trim(), platforms: uniq, scheduledAtMs } };
      }
      expect(verdict).toEqual(expected);
    }
  });

  it('cancel verdicts refuse everything except a scheduled post', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i += 1) {
      const roll = Math.floor(rng() * 3);
      const status = roll === 0 ? 'scheduled' : roll === 1 ? 'cancelled' : 'weird';
      expect(planCancelPost(status).ok).toBe(status === 'scheduled');
    }
  });
});
