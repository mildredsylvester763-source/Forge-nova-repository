import {
  MAX_PAGE_BLOCKS,
  planPublish,
  validateBlocks,
  validatePageTitle,
  validateSiteName,
  validateSlug,
  validateTemplate,
} from './website-engine';

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

// The slug oracle checks character by character, an independent path from
// the regex used by the engine.

describe('website-engine (pinned vectors)', () => {
  it('validates site names and templates by name', () => {
    expect(validateSiteName('  Mildred Cakes  ')).toEqual({ ok: true, value: 'Mildred Cakes' });
    expect(validateSiteName('   ')).toEqual({ ok: false, reason: 'site-invalid-name' });
    expect(validateSiteName(9)).toEqual({ ok: false, reason: 'site-invalid-name' });
    expect(validateSiteName('x'.repeat(81))).toEqual({ ok: false, reason: 'site-invalid-name' });
    expect(validateTemplate('bold')).toEqual({ ok: true, value: 'bold' });
    expect(validateTemplate('sparkly')).toEqual({ ok: false, reason: 'site-invalid-template' });
    expect(validateTemplate(4)).toEqual({ ok: false, reason: 'site-invalid-template' });
  });

  it('validates page titles, slugs and blocks by name', () => {
    expect(validatePageTitle('  Home  ')).toEqual({ ok: true, value: 'Home' });
    expect(validatePageTitle('  ')).toEqual({ ok: false, reason: 'page-invalid-title' });
    expect(validatePageTitle(2)).toEqual({ ok: false, reason: 'page-invalid-title' });
    expect(validateSlug('  About-Us  ')).toEqual({ ok: true, value: 'about-us' });
    expect(validateSlug('About Us')).toEqual({ ok: false, reason: 'page-invalid-slug' });
    expect(validateSlug('-nope')).toEqual({ ok: false, reason: 'page-invalid-slug' });
    expect(validateSlug('no--pe')).toEqual({ ok: false, reason: 'page-invalid-slug' });
    expect(validateSlug('x'.repeat(81))).toEqual({ ok: false, reason: 'page-invalid-slug' });
    expect(validateBlocks([{ type: 'heading', text: ' Hello ' }])).toEqual({
      ok: true,
      value: [{ type: 'heading', text: 'Hello' }],
    });
    expect(validateBlocks([])).toEqual({ ok: false, reason: 'page-no-blocks' });
    expect(validateBlocks('nope')).toEqual({ ok: false, reason: 'page-invalid-blocks' });
    expect(validateBlocks([{ type: 'video', text: 'x' }])).toEqual({ ok: false, reason: 'page-invalid-block-type' });
    expect(validateBlocks([{ type: 'heading', text: '   ' }])).toEqual({ ok: false, reason: 'page-invalid-block-text' });
    const many = Array.from({ length: MAX_PAGE_BLOCKS + 1 }, () => ({ type: 'text', text: 'a' }));
    expect(validateBlocks(many)).toEqual({ ok: false, reason: 'page-too-many-blocks' });
  });

  it('refuses to publish a site without pages', () => {
    expect(planPublish(0)).toEqual({ ok: false, reason: 'site-no-pages' });
    expect(planPublish(1)).toEqual({ ok: true, value: 'published' });
    expect(planPublish(7)).toEqual({ ok: true, value: 'published' });
    expect(planPublish(-1)).toEqual({ ok: false, reason: 'site-invalid-state' });
    expect(planPublish(1.5)).toEqual({ ok: false, reason: 'site-invalid-state' });
  });
});

describe('website-engine (500-case sweep, seed 42)', () => {
  it('slug verdicts match a character-by-character oracle', () => {
    const rng = mulberry32(42);
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789- .ABC';
    const rand = (n: number) => {
      let s = '';
      for (let i = 0; i < n; i += 1) {
        s += chars[Math.floor(rng() * chars.length)];
      }
      return s;
    };
    const oracle = (s: string) => {
      if (s.length < 1 || s.length > 80) {
        return false;
      }
      for (let i = 0; i < s.length; i += 1) {
        const c = s[i];
        const okChar = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-';
        if (!okChar) {
          return false;
        }
        if (c === '-' && (i === 0 || s[i - 1] === '-' || i === s.length - 1)) {
          return false;
        }
      }
      return true;
    };
    for (let i = 0; i < 500; i += 1) {
      const raw = rand(1 + Math.floor(rng() * 12));
      const verdict = validateSlug(raw);
      expect(verdict.ok).toBe(oracle(raw.trim().toLowerCase()));
    }
  });

  it('blocks verdicts match an independent counter oracle', () => {
    const rng = mulberry32(42);
    const types = ['heading', 'text', 'image', 'button', 'contact', 'bogus'];
    for (let i = 0; i < 500; i += 1) {
      const count = 1 + Math.floor(rng() * 25);
      let oracleOk = count <= MAX_PAGE_BLOCKS;
      const blocks: Array<{ type: string; text: string }> = [];
      for (let j = 0; j < count; j += 1) {
        const type = rng() < 0.8 ? types[Math.floor(rng() * 5)] : types[5];
        const text = rng() < 0.9 ? 'hello world'.slice(0, 1 + Math.floor(rng() * 11)) : '';
        if (type === 'bogus' || text.length < 1) {
          oracleOk = false;
        }
        blocks.push({ type, text });
      }
      expect(validateBlocks(blocks).ok).toBe(oracleOk);
    }
  });
});
