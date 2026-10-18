import { normalizeTag, normalizeTags, validateNotes } from './connection-meta';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('engine/connection-meta (tags and notes)', () => {
  it('normalizes a valid tag: trimmed, lowercased, safe characters', () => {
    const r = normalizeTag('  Production-1 ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('production-1');
  });

  it('refuses malformed tags by name', () => {
    expect(normalizeTag(42 as unknown as string).ok).toBe(false);
    expect(normalizeTag('').ok).toBe(false);
    expect(normalizeTag('a'.repeat(25)).ok).toBe(false);
    expect(normalizeTag('-lead').ok).toBe(false);
    expect(normalizeTag('has space').ok).toBe(false);
    expect(normalizeTag('bad!char').ok).toBe(false);
  });

  it('deduplicates tags and enforces the ceiling', () => {
    const r = normalizeTags(['prod', 'PROD', 'Prod']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(['prod']);
    const tooMany: string[] = [];
    for (let i = 0; i < 13; i++) tooMany.push('tag-' + i);
    const over = normalizeTags(tooMany);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('meta-too-many-tags');
    expect(normalizeTags('not-an-array' as unknown as string[]).ok).toBe(false);
  });

  it('bounds notes to a trimmed maximum', () => {
    const r = validateNotes('  keep an eye on this connection  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('keep an eye on this connection');
    const over = validateNotes('x'.repeat(501));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('meta-notes-too-long');
    expect(validateNotes(5 as unknown as string).ok).toBe(false);
  });

  it('mulberry32 500-case sweep (seed 42): output tags always valid and unique', () => {
    const rnd = mulberry32(42);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789._- ';
    for (let i = 0; i < 500; i++) {
      const len = 1 + Math.floor(rnd() * 26);
      let s = '';
      for (let c = 0; c < len; c++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const r = normalizeTags([s, s.toUpperCase(), 'fixed-tag']);
      if (!r.ok) continue;
      expect(r.value.length).toBeLessThanOrEqual(new Set(r.value).size);
      for (const tag of r.value) expect(/^[a-z0-9][a-z0-9._-]*$/.test(tag)).toBe(true);
    }
  });
});
