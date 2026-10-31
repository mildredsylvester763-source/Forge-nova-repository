import {
  normalizeSupplier,
  validateAddress,
  validateEmail,
  validateLeadTimeDays,
  validateNotes,
  validatePhone,
  validateSupplierName,
} from './supplier-engine';

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

describe('supplier-engine (pinned vectors)', () => {
  it('trims names and refuses empty or oversized ones', () => {
    expect(validateSupplierName('  Acme Ltd  ')).toEqual({ ok: true, value: 'Acme Ltd' });
    expect(validateSupplierName('   ')).toEqual({ ok: false, reason: 'supplier-invalid-name' });
    expect(validateSupplierName('x'.repeat(81))).toEqual({ ok: false, reason: 'supplier-invalid-name' });
  });

  it('treats a missing email as fine but refuses broken ones', () => {
    expect(validateEmail(null)).toEqual({ ok: true, value: null });
    expect(validateEmail(undefined)).toEqual({ ok: true, value: null });
    expect(validateEmail('')).toEqual({ ok: true, value: null });
    expect(validateEmail('orders@acme.co')).toEqual({ ok: true, value: 'orders@acme.co' });
    expect(validateEmail('nope')).toEqual({ ok: false, reason: 'supplier-invalid-email' });
    expect(validateEmail('a@b.' + 'c'.repeat(120))).toEqual({ ok: false, reason: 'supplier-invalid-email' });
  });

  it('accepts realistic phone numbers and refuses junk', () => {
    expect(validatePhone(null)).toEqual({ ok: true, value: null });
    expect(validatePhone('+234 801 234 5678')).toEqual({ ok: true, value: '+234 801 234 5678' });
    expect(validatePhone('123')).toEqual({ ok: false, reason: 'supplier-invalid-phone' });
    expect(validatePhone('call me maybe')).toEqual({ ok: false, reason: 'supplier-invalid-phone' });
  });

  it('validates addresses, lead times and notes', () => {
    expect(validateAddress(null)).toEqual({ ok: true, value: null });
    expect(validateAddress('  1 Warehouse Road  ')).toEqual({ ok: true, value: '1 Warehouse Road' });
    expect(validateAddress('y'.repeat(201))).toEqual({ ok: false, reason: 'supplier-invalid-address' });
    expect(validateLeadTimeDays(14)).toEqual({ ok: true, value: 14 });
    expect(validateLeadTimeDays(null)).toEqual({ ok: true, value: 0 });
    expect(validateLeadTimeDays(1.5)).toEqual({ ok: false, reason: 'supplier-invalid-lead-time' });
    expect(validateLeadTimeDays(366)).toEqual({ ok: false, reason: 'supplier-invalid-lead-time' });
    expect(validateNotes(null)).toEqual({ ok: true, value: null });
    expect(validateNotes(' fast ')).toEqual({ ok: true, value: 'fast' });
    expect(validateNotes('z'.repeat(501))).toEqual({ ok: false, reason: 'supplier-notes-too-long' });
  });

  it('normalizes a full supplier draft with a default lead time of zero', () => {
    expect(normalizeSupplier({ name: ' Acme ' })).toEqual({
      ok: true,
      value: { name: 'Acme', email: null, phone: null, address: null, leadTimeDays: 0, notes: null },
    });
    expect(
      normalizeSupplier({
        name: ' Acme ',
        email: 'a@b.co',
        phone: '+2348012345678',
        address: ' 1 Road ',
        leadTimeDays: 7,
        notes: ' fast ',
      }),
    ).toEqual({
      ok: true,
      value: { name: 'Acme', email: 'a@b.co', phone: '+2348012345678', address: '1 Road', leadTimeDays: 7, notes: 'fast' },
    });
    expect(normalizeSupplier({ name: 'Acme', leadTimeDays: 400 })).toEqual({
      ok: false,
      reason: 'supplier-invalid-lead-time',
    });
  });
});

describe('supplier-engine (500-case sweep, seed 42)', () => {
  it('name validity follows the trim and length rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(rng() * 100);
      const pad = rng() < 0.5 ? ' ' : '';
      const name = pad + 'x'.repeat(len) + pad;
      const verdict = validateSupplierName(name);
      const trimmed = name.trim();
      const valid = trimmed.length >= 1 && trimmed.length <= 80;
      expect(verdict.ok).toBe(valid);
      if (valid) {
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value).toBe(trimmed);
      }
    }
  });

  it('email validity follows the pattern and length rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const roll = rng();
      const email =
        roll < 0.3
          ? null
          : roll < 0.6
            ? 'user' + i + '@example.com'
            : roll < 0.8
              ? 'broken-at-' + i
              : 'a@b.' + 'c'.repeat(Math.floor(rng() * 130) + 1);
      const verdict = validateEmail(email);
      const valid =
        email === null ||
        (typeof email === 'string' && email.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
      expect(verdict.ok).toBe(valid);
    }
  });

  it('lead time validity follows the integer range rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const days = Math.floor(rng() * 400) - 10 + (rng() < 0.3 ? 0.5 : 0);
      const verdict = validateLeadTimeDays(days);
      const valid = Number.isInteger(days) && days >= 0 && days <= 365;
      expect(verdict.ok).toBe(valid);
    }
  });
});
