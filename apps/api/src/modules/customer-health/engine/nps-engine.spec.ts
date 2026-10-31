import {
  classifyRating,
  computeNpsScore,
  planNpsSurvey,
  validateChannel,
  validateComment,
} from './nps-engine';

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

const DAY_MS = 24 * 3600 * 1000;

describe('nps-engine (pinned vectors)', () => {
  it('classifies ratings the standard way: 9-10 promoter, 7-8 passive, 0-6 detractor', () => {
    expect(classifyRating(10)).toEqual({ ok: true, value: 'promoter' });
    expect(classifyRating(9)).toEqual({ ok: true, value: 'promoter' });
    expect(classifyRating(8)).toEqual({ ok: true, value: 'passive' });
    expect(classifyRating(7)).toEqual({ ok: true, value: 'passive' });
    expect(classifyRating(6)).toEqual({ ok: true, value: 'detractor' });
    expect(classifyRating(0)).toEqual({ ok: true, value: 'detractor' });
  });

  it('refuses out-of-range or fractional ratings', () => {
    expect(classifyRating(11)).toEqual({ ok: false, reason: 'nps-invalid-rating' });
    expect(classifyRating(-1)).toEqual({ ok: false, reason: 'nps-invalid-rating' });
    expect(classifyRating(1.5)).toEqual({ ok: false, reason: 'nps-invalid-rating' });
  });

  it('treats a missing comment as fine but refuses long or non-string comments', () => {
    expect(validateComment(null)).toEqual({ ok: true, value: null });
    expect(validateComment(undefined)).toEqual({ ok: true, value: null });
    expect(validateComment('great service')).toEqual({ ok: true, value: 'great service' });
    expect(validateComment('x'.repeat(1001))).toEqual({
      ok: false,
      reason: 'nps-comment-too-long',
    });
  });

  it('only allows the standard survey channels', () => {
    expect(validateChannel('email')).toEqual({ ok: true, value: 'email' });
    expect(validateChannel('in-app')).toEqual({ ok: true, value: 'in-app' });
    expect(validateChannel('smoke-signal')).toEqual({
      ok: false,
      reason: 'nps-invalid-channel',
    });
  });

  it('enforces the quarterly survey cooldown', () => {
    const now = 1700000000000;
    expect(planNpsSurvey(null, now)).toEqual({ ok: true, value: null });
    expect(planNpsSurvey(now - 1000, now)).toEqual({
      ok: false,
      reason: 'nps-too-frequent',
    });
    expect(planNpsSurvey(now - 91 * DAY_MS, now)).toEqual({ ok: true, value: null });
    expect(planNpsSurvey(now - 89 * DAY_MS, now)).toEqual({
      ok: false,
      reason: 'nps-too-frequent',
    });
  });

  it('computes NPS as percent promoters minus percent detractors', () => {
    expect(computeNpsScore({ promoters: 60, passives: 40, detractors: 100 })).toEqual({
      ok: true,
      value: { score: -20, total: 200, promoters: 60, passives: 40, detractors: 100 },
    });
    expect(computeNpsScore({ promoters: 10, passives: 0, detractors: 0 })).toEqual({
      ok: true,
      value: { score: 100, total: 10, promoters: 10, passives: 0, detractors: 0 },
    });
    expect(computeNpsScore({ promoters: 0, passives: 0, detractors: 0 })).toEqual({
      ok: false,
      reason: 'nps-no-responses',
    });
  });
});

describe('nps-engine (500-case sweep, seed 42)', () => {
  it('classification matches the thresholds for every rating', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const score = Math.floor(rng() * 13) - 1;
      const verdict = classifyRating(score);
      const valid = Number.isInteger(score) && score >= 0 && score <= 10;
      expect(verdict.ok).toBe(valid);
      if (valid) {
        const expected = score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';
        expect(verdict.value).toBe(expected);
      }
    }
  });

  it('score math is exact for random counts', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const promoters = Math.floor(rng() * 20);
      const passives = Math.floor(rng() * 20);
      const detractors = Math.floor(rng() * 20);
      const verdict = computeNpsScore({ promoters, passives, detractors });
      if (promoters + passives + detractors === 0) {
        expect(verdict).toEqual({ ok: false, reason: 'nps-no-responses' });
      } else {
        if (!verdict.ok) throw new Error('expected success');
        const total = promoters + passives + detractors;
        expect(verdict.value.score).toBe(Math.round((100 * (promoters - detractors)) / total));
        expect(verdict.value.total).toBe(total);
      }
    }
  });
});
