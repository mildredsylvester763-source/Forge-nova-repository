import { computeCheckDigit, normalizeBarcode } from './barcode-engine';

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

describe('barcode-engine (pinned vectors)', () => {
  it('accepts full EAN-13 codes with a valid checksum', () => {
    expect(normalizeBarcode('5901234123457')).toEqual({ ok: true, value: '5901234123457' });
    expect(normalizeBarcode(' 5901234123457 ')).toEqual({ ok: true, value: '5901234123457' });
  });

  it('completes 12 and 11 digit bases to full EAN-13 and UPC-A codes', () => {
    expect(normalizeBarcode('590123412345')).toEqual({ ok: true, value: '5901234123457' });
    expect(normalizeBarcode('03600029145')).toEqual({ ok: true, value: '036000291452' });
  });

  it('refuses bad checksums and wrong lengths by name', () => {
    expect(normalizeBarcode('5901234123456')).toEqual({ ok: false, reason: 'barcode-bad-checksum' });
    expect(normalizeBarcode('12345')).toEqual({ ok: false, reason: 'barcode-invalid-format' });
    expect(normalizeBarcode('   ')).toEqual({ ok: false, reason: 'barcode-invalid-format' });
  });

  it('treats non-digit codes as Code 128 style within ASCII and length bounds', () => {
    expect(normalizeBarcode(' SKU-XYZ-001! ')).toEqual({ ok: true, value: 'SKU-XYZ-001!' });
    expect(normalizeBarcode('a'.repeat(48))).toEqual({ ok: true, value: 'a'.repeat(48) });
    expect(normalizeBarcode('a'.repeat(49))).toEqual({ ok: false, reason: 'barcode-invalid-format' });
    expect(normalizeBarcode('AB	CD')).toEqual({ ok: false, reason: 'barcode-invalid-format' });
    expect(normalizeBarcode(1234567890123)).toEqual({ ok: false, reason: 'barcode-invalid-format' });
  });
});

describe('barcode-engine (500-case sweep, seed 42)', () => {
  it('digit codes follow the EAN-13 and UPC-A length and checksum rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const len = 5 + Math.floor(rng() * 12);
      let s = '';
      for (let j = 0; j < len; j++) s += String(Math.floor(rng() * 10));
      const verdict = normalizeBarcode(s);
      if (len === 11) {
        expect(verdict.ok).toBe(true);
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value).toBe(s + String(computeCheckDigit('0' + s)));
      } else if (len === 12) {
        expect(verdict.ok).toBe(true);
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value).toBe(s + String(computeCheckDigit(s)));
      } else if (len === 13) {
        const good = s.charCodeAt(12) - 48 === computeCheckDigit(s.slice(0, 12));
        expect(verdict.ok).toBe(good);
      } else {
        expect(verdict).toEqual({ ok: false, reason: 'barcode-invalid-format' });
      }
    }
  });

  it('mixed codes follow the digit, ASCII and length rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(rng() * 55);
      let s = '';
      for (let j = 0; j < len; j++) s += String.fromCharCode(31 + Math.floor(rng() * 98));
      const verdict = normalizeBarcode(s);
      const t = s.trim();
      if (/^[0-9]+$/.test(t)) {
        if (t.length === 11 || t.length === 12) {
          expect(verdict.ok).toBe(true);
        } else if (t.length === 13) {
          expect(verdict.ok).toBe(t.charCodeAt(12) - 48 === computeCheckDigit(t.slice(0, 12)));
        } else {
          expect(verdict.ok).toBe(false);
        }
      } else {
        const charsOk =
          t.length >= 1 &&
          t.length <= 48 &&
          t.split('').every((ch) => {
            const c = ch.charCodeAt(0);
            return c >= 32 && c <= 126;
          });
        expect(verdict.ok).toBe(charsOk);
      }
    }
  });
});
