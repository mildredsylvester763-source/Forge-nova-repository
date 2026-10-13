// ============================================================================
// FILE: /apps/api/src/modules/contacts/engine/contact-dedupe.spec.ts
// ============================================================================

import { dedupeKeyFor, findDuplicate, normalizeEmail, normalizeName } from './contact-dedupe';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('normalizeName / normalizeEmail', () => {
  it('collapses punctuation, case and whitespace', () => {
    expect(normalizeName('  Acme Corp., Ltd. ')).toBe('acme corp ltd');
    expect(normalizeName('ZINO LTD')).toBe('zino ltd');
    expect(normalizeEmail(' A@B.co ')).toBe('a@b.co');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('dedupeKeyFor', () => {
  it('lets a valid email win, and falls back to the name key', () => {
    expect(dedupeKeyFor({ name: 'Acme', email: ' A@B.co ' })).toBe('email:a@b.co');
    expect(dedupeKeyFor({ name: 'Acme', email: 'not-an-email' })).toBe('name:acme');
    expect(dedupeKeyFor({ name: 'Zino Ltd' })).toBe('name:zino ltd');
  });
});

describe('findDuplicate', () => {
  it('detects exact key matches', () => {
    expect(findDuplicate([{ dedupeKey: 'email:a@b.co' }], 'email:a@b.co')).toBe(true);
    expect(findDuplicate([{ dedupeKey: 'email:a@b.co' }], 'email:c@d.co')).toBe(false);
  });
});

describe('500-contact seeded sweep', () => {
  it('finds duplicates in a growing key set deterministically', () => {
    const rnd = mulberry32(31337);
    const keys: string[] = [];
    let dupes = 0;
    for (let i = 0; i < 500; i++) {
      const name = 'Name ' + Math.floor(rnd() * 40);
      const email = rnd() < 0.6 ? 'user' + Math.floor(rnd() * 40) + '@ex.com' : rnd() < 0.2 ? 'bad email' : null;
      const k = dedupeKeyFor({ name, email });
      expect(k.startsWith('email:') || k.startsWith('name:')).toBe(true);
      if (findDuplicate(keys.map((x) => ({ dedupeKey: x })), k)) dupes++;
      else keys.push(k);
    }
    expect(dupes).toBeGreaterThan(20);
    expect(keys.length + dupes).toBe(500);
  });
});
