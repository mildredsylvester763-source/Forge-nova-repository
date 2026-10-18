import { searchDestinations } from './destination-query';

interface TestDest {
  id: string;
  name: string;
  kind: string;
  authStyle: string;
}

const CATALOG: TestDest[] = [
  { id: 'stripe', name: 'Stripe', kind: 'payments', authStyle: 'bearer' },
  { id: 'twilio', name: 'Twilio', kind: 'communications', authStyle: 'basic' },
  { id: 'github', name: 'GitHub', kind: 'devtools', authStyle: 'bearer' },
  { id: 'shopify', name: 'Shopify', kind: 'ecommerce', authStyle: 'api-key-header' },
  { id: 'posthog', name: 'PostHog', kind: 'analytics', authStyle: 'api-key-header' },
  { id: 'notion', name: 'Notion', kind: 'productivity', authStyle: 'bearer' },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('engine/destination-query (catalog search/filter)', () => {
  it('defaults to the first page of the whole catalog', () => {
    const r = searchDestinations(CATALOG, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBe(6);
      expect(r.value.items.length).toBe(6);
      expect(r.value.limit).toBe(50);
      expect(r.value.offset).toBe(0);
    }
  });

  it('filters by kind and authStyle', () => {
    const kind = searchDestinations(CATALOG, { kind: 'devtools' });
    expect(kind.ok).toBe(true);
    if (kind.ok) {
      expect(kind.value.total).toBe(1);
      expect(kind.value.items[0].id).toBe('github');
    }
    const auth = searchDestinations(CATALOG, { authStyle: 'basic' });
    expect(auth.ok).toBe(true);
    if (auth.ok) expect(auth.value.items[0].id).toBe('twilio');
  });

  it('refuses unknown kinds and auth styles by name (no silent empty list)', () => {
    const badKind = searchDestinations(CATALOG, { kind: 'nope' });
    expect(badKind.ok).toBe(false);
    if (!badKind.ok) expect(badKind.reason).toBe('destination-query-unknown-kind:nope');
    const badAuth = searchDestinations(CATALOG, { authStyle: 'digest' });
    expect(badAuth.ok).toBe(false);
    if (!badAuth.ok) expect(badAuth.reason).toBe('destination-query-unknown-auth-style:digest');
  });

  it('searches ids and names, case-insensitive, trimmed', () => {
    const r = searchDestinations(CATALOG, { search: ' GITHUB ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBe(1);
      expect(r.value.items[0].id).toBe('github');
    }
    const byName = searchDestinations(CATALOG, { search: 'post' });
    expect(byName.ok).toBe(true);
    if (byName.ok) expect(byName.value.items[0].id).toBe('posthog');
  });

  it('paginates deterministically in catalog order', () => {
    const page = searchDestinations(CATALOG, { limit: '2', offset: '1' });
    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(page.value.items.length).toBe(2);
      expect(page.value.items[0].id).toBe('twilio');
      expect(page.value.offset).toBe(1);
    }
  });

  it('refuses malformed pagination and inputs by name', () => {
    expect(searchDestinations(CATALOG, { limit: '201' }).ok).toBe(false);
    expect(searchDestinations(CATALOG, { limit: '0' }).ok).toBe(false);
    expect(searchDestinations(CATALOG, { limit: 'abc' }).ok).toBe(false);
    expect(searchDestinations(CATALOG, { offset: '-1' }).ok).toBe(false);
    expect(searchDestinations(CATALOG, null as unknown as Record<string, unknown>).ok).toBe(false);
    expect(searchDestinations(null as unknown as TestDest[], {}).ok).toBe(false);
  });

  it('mulberry32 500-case sweep (seed 42): every returned item matches every filter', () => {
    const rnd = mulberry32(42);
    const pool: TestDest[] = [];
    for (let i = 0; i < 120; i++) {
      pool.push({
        id: 'dest-' + i,
        name: 'Dest ' + i,
        kind: 'kind' + (i % 6),
        authStyle: ['bearer', 'basic', 'api-key-header'][i % 3],
      });
    }
    for (let i = 0; i < 500; i++) {
      const q: Record<string, unknown> = {};
      if (rnd() < 0.6) q.search = 'dest-1' + Math.floor(rnd() * 20);
      if (rnd() < 0.4) q.kind = 'kind' + Math.floor(rnd() * 6);
      if (rnd() < 0.3) q.authStyle = ['bearer', 'basic', 'api-key-header'][Math.floor(rnd() * 3)];
      if (rnd() < 0.5) q.limit = String(1 + Math.floor(rnd() * 100));
      if (rnd() < 0.3) q.offset = String(Math.floor(rnd() * 50));
      const res = searchDestinations(pool, q);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      for (const item of res.value.items) {
        if (q.kind) expect(item.kind).toBe(q.kind);
        if (q.authStyle) expect(item.authStyle).toBe(q.authStyle);
        if (typeof q.search === 'string') {
          const needle = q.search.toLowerCase();
          expect(item.id.includes(needle) || item.name.toLowerCase().includes(needle)).toBe(true);
        }
      }
      expect(res.value.items.length).toBeLessThanOrEqual(res.value.limit);
    }
  });
});
