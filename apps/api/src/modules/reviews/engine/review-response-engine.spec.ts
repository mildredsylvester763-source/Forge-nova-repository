import { buildReviewResponse, TONES, MAX_REVIEW_LENGTH } from './review-response-engine';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('review-response engine', () => {
  it('drafts a warm response to a 5 star review', () => {
    const v = buildReviewResponse({ rating: 5, reviewText: 'Loved the bread!', customerName: 'Ada', tone: 'warm' });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.response).toContain('Ada');
      expect(v.value.response).toContain('Loved the bread!');
    }
  });

  it('drafts an apologetic response to a 1 star review', () => {
    const v = buildReviewResponse({ rating: 1, reviewText: 'Slow service', customerName: 'Ada', tone: 'apologetic' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.response).toContain('make it right');
  });

  it('refuses apologising for a 4 or 5 star review', () => {
    const v = buildReviewResponse({ rating: 5, reviewText: 'Great', customerName: 'Ada', tone: 'apologetic' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('review-response-tone-mismatch');
  });

  it('refuses invalid ratings, texts and tones by name', () => {
    const a = buildReviewResponse({ rating: 0, reviewText: 'x', customerName: 'Ada', tone: 'warm' });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('review-response-invalid-rating');
    const b = buildReviewResponse({ rating: 3, reviewText: '   ', customerName: 'Ada', tone: 'warm' });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('review-response-invalid-text');
    const c = buildReviewResponse({ rating: 3, reviewText: 'ok', customerName: 'Ada', tone: 'snarky' });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('review-response-invalid-tone');
  });

  it('quotes only the first 80 characters of a long review', () => {
    const long = 'x'.repeat(200);
    const v = buildReviewResponse({ rating: 4, reviewText: long, customerName: 'Ada', tone: 'professional' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.response).toContain('x'.repeat(80));
    expect(MAX_REVIEW_LENGTH).toBe(2000);
    expect(TONES).toEqual(['professional', 'warm', 'apologetic']);
  });

  it('is deterministic: the same input drafts the same response twice', () => {
    const input = { rating: 4, reviewText: 'Good stuff', customerName: 'Ada', tone: 'professional' };
    const a = buildReviewResponse(input);
    const b = buildReviewResponse(input);
    expect(a).toEqual(b);
  });

  it('sweeps 500 random valid and invalid combinations', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const rating = 1 + Math.floor(rng() * 5);
      const tone = TONES[Math.floor(rng() * TONES.length)];
      const v = buildReviewResponse({ rating, reviewText: 'Review number ' + i, customerName: 'Cust ' + i, tone });
      if (tone === 'apologetic' && rating >= 4) {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe('review-response-tone-mismatch');
      } else {
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.value.response).toContain('Cust ' + i);
      }
    }
  });
});
