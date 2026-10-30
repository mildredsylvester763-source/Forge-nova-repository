import {
  planReviewRequest,
  buildRequestMessage,
  CHANNELS,
  MAX_REQUESTS_PER_YEAR,
  MIN_DAYS_BETWEEN_REQUESTS,
  DAY_MS,
} from './review-request-engine';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('review-request engine', () => {
  const NOW = 2000000000000;

  it('allows a first-ever request', () => {
    const v = planReviewRequest({
      nowMs: NOW,
      lastRequestAtMs: null,
      requestsThisYear: 0,
      customerName: 'Ada',
      channel: 'email',
    });
    expect(v.ok).toBe(true);
  });

  it('refuses a second request inside the 30 day cooldown', () => {
    const v = planReviewRequest({
      nowMs: NOW,
      lastRequestAtMs: NOW - (MIN_DAYS_BETWEEN_REQUESTS - 1) * DAY_MS,
      requestsThisYear: 1,
      customerName: 'Ada',
      channel: 'email',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('review-request-too-frequent');
  });

  it('allows a request after the cooldown has passed', () => {
    const v = planReviewRequest({
      nowMs: NOW,
      lastRequestAtMs: NOW - (MIN_DAYS_BETWEEN_REQUESTS + 1) * DAY_MS,
      requestsThisYear: 1,
      customerName: 'Ada',
      channel: 'sms',
    });
    expect(v.ok).toBe(true);
  });

  it('enforces the yearly cap of 4 requests', () => {
    const v = planReviewRequest({
      nowMs: NOW,
      lastRequestAtMs: NOW - 40 * DAY_MS,
      requestsThisYear: MAX_REQUESTS_PER_YEAR,
      customerName: 'Ada',
      channel: 'whatsapp',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('review-request-yearly-cap-exceeded');
  });

  it('refuses unknown channels and bad names with named reasons', () => {
    const a = planReviewRequest({
      nowMs: NOW,
      lastRequestAtMs: null,
      requestsThisYear: 0,
      customerName: 'Ada',
      channel: 'pigeon',
    });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('review-request-invalid-channel');
    const b = planReviewRequest({
      nowMs: NOW,
      lastRequestAtMs: null,
      requestsThisYear: 0,
      customerName: '   ',
      channel: 'email',
    });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('review-request-invalid-name');
  });

  it('pins the channels list', () => {
    expect(CHANNELS).toEqual(['email', 'sms', 'whatsapp']);
    expect(MAX_REQUESTS_PER_YEAR).toBe(4);
  });

  it('builds a message that names the customer and carries the link', () => {
    const v = buildRequestMessage('Ada', 'Ada Bakery', 'https://reviews.example/ada');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.message).toContain('Ada');
      expect(v.value.message).toContain('Ada Bakery');
      expect(v.value.message).toContain('https://reviews.example/ada');
    }
  });

  it('refuses broken links and business names', () => {
    const a = buildRequestMessage('Ada', 'Ada Bakery', 'not-a-url');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('review-request-invalid-link');
    const b = buildRequestMessage('Ada', '', 'https://reviews.example/ada');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('review-request-invalid-business');
  });

  it('sweeps 500 random cases against the cooldown and cap laws', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const hasLast = rng() < 0.5;
      const days = Math.floor(rng() * 60);
      const lastRequestAtMs = hasLast ? NOW - days * DAY_MS : null;
      const requestsThisYear = Math.floor(rng() * 7);
      const v = planReviewRequest({
        nowMs: NOW,
        lastRequestAtMs,
        requestsThisYear,
        customerName: 'Cust ' + i,
        channel: CHANNELS[Math.floor(rng() * CHANNELS.length)],
      });
      const inCooldown = hasLast && days < MIN_DAYS_BETWEEN_REQUESTS;
      if (inCooldown) {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe('review-request-too-frequent');
      } else if (requestsThisYear >= MAX_REQUESTS_PER_YEAR) {
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe('review-request-yearly-cap-exceeded');
      } else {
        expect(v.ok).toBe(true);
      }
    }
  });
});
