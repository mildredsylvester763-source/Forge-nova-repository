import {
  planPublishPost,
  planUnsubscribe,
  validateEmail,
  validateIssueSubject,
  validatePostBody,
  validatePostSlug,
  validatePostTitle,
} from './content-engine';

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

// The email oracle splits at the at-sign and validates each side with
// independent character loops, a different path from the regex.

describe('content-engine (pinned vectors)', () => {
  it('validates posts and subscribers by name', () => {
    expect(validatePostTitle('  Cake Trends 2026  ')).toEqual({ ok: true, value: 'Cake Trends 2026' });
    expect(validatePostTitle('x'.repeat(121))).toEqual({ ok: false, reason: 'post-invalid-title' });
    expect(validatePostSlug('  Cake-Trends-2026  ')).toEqual({ ok: true, value: 'cake-trends-2026' });
    expect(validatePostSlug('Cake Trends')).toEqual({ ok: false, reason: 'post-invalid-slug' });
    expect(validatePostSlug('-nope')).toEqual({ ok: false, reason: 'post-invalid-slug' });
    expect(validatePostBody('  hello world  ')).toEqual({ ok: true, value: 'hello world' });
    expect(validatePostBody('x'.repeat(10001))).toEqual({ ok: false, reason: 'post-invalid-body' });
    expect(validateEmail('  Ada@Example.COM  ')).toEqual({ ok: true, value: 'ada@example.com' });
    expect(validateEmail('nope@')).toEqual({ ok: false, reason: 'subscriber-invalid-email' });
    expect(validateEmail('a@b.c')).toEqual({ ok: false, reason: 'subscriber-invalid-email' });
    expect(validateIssueSubject('  Issue 5  ')).toEqual({ ok: true, value: 'Issue 5' });
    expect(validateIssueSubject('   ')).toEqual({ ok: false, reason: 'issue-invalid-subject' });
  });

  it('publishes once and unsubscribes once, refusing by name', () => {
    expect(planPublishPost('draft')).toEqual({ ok: true, value: 'published' });
    expect(planPublishPost('published')).toEqual({ ok: false, reason: 'post-already-published' });
    expect(planPublishPost('weird')).toEqual({ ok: false, reason: 'post-invalid-state' });
    expect(planUnsubscribe({ status: 'subscribed' })).toEqual({ ok: true, value: 'unsubscribed' });
    expect(planUnsubscribe({ status: 'unsubscribed' })).toEqual({ ok: false, reason: 'subscriber-already-unsubscribed' });
    expect(planUnsubscribe(null)).toEqual({ ok: false, reason: 'subscriber-not-found' });
  });
});

describe('content-engine (500-case sweep, seed 42)', () => {
  it('email verdicts match a split-and-scan oracle', () => {
    const rng = mulberry32(42);
    const localChars = 'abcdefgh._%+-';
    const hostChars = 'wxyz-.';
    for (let i = 0; i < 500; i += 1) {
      let candidate = '';
      if (rng() < 0.7) {
        const local = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => localChars[Math.floor(rng() * localChars.length)]).join('');
        const host = Array.from({ length: 4 + Math.floor(rng() * 5) }, () => hostChars[Math.floor(rng() * hostChars.length)]).join('');
        candidate = local + '@' + host;
      } else {
        const local = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => localChars[Math.floor(rng() * localChars.length)]).join('');
        candidate = local + rng().toString(36).slice(2, 6);
      }
      const verdict = validateEmail(candidate);
      const at = candidate.indexOf('@');
      const singleAt = at > 0 && candidate.indexOf('@', at + 1) === -1;
      const localOk = /^[a-z0-9._%+-]+$/.test(candidate.slice(0, at));
      const hostPart = candidate.slice(at + 1);
      const hostOk = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostPart);
      const lengthOk = candidate.length >= 5 && candidate.length <= 254;
      const expected = singleAt && localOk && hostOk && lengthOk;
      expect(verdict.ok).toBe(expected);
    }
  });

  it('publish refuses everything except a draft', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i += 1) {
      const roll = Math.floor(rng() * 3);
      const status = roll === 0 ? 'draft' : roll === 1 ? 'published' : 'weird';
      expect(planPublishPost(status).ok).toBe(status === 'draft');
    }
  });
});
