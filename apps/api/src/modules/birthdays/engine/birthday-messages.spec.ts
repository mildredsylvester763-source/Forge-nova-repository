import {
  validateMonthDay,
  planBirthdayGreeting,
  shouldSendBirthday,
  pickVariant,
  MAX_NAME_LENGTH,
  GREETING_COUNT,
} from './birthday-messages';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('birthday-messages engine', () => {
  it('accepts well-formed month-day strings', () => {
    for (const good of ['03-14', '12-31', '01-01', ' 06-09 ']) {
      const v = validateMonthDay(good);
      expect(v.ok).toBe(true);
    }
    const v = validateMonthDay(' 06-09 ');
    if (v.ok) expect(v.value.monthDay).toBe('06-09');
  });

  it('refuses malformed dates with named reasons', () => {
    const a = validateMonthDay('13-01');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('birthday-invalid-month');
    const b = validateMonthDay('03-32');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('birthday-invalid-day');
    const c = validateMonthDay('3-14');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('birthday-invalid-month-day');
    const d = validateMonthDay(42);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe('birthday-invalid-month-day');
  });

  it('builds a greeting with the customer name in it', () => {
    const v = planBirthdayGreeting('Ada', 0);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.message).toContain('Ada');
      expect(v.value.message).not.toContain('{name}');
    }
  });

  it('refuses bad names and variants', () => {
    const a = planBirthdayGreeting('   ', 0);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('birthday-invalid-name');
    const b = planBirthdayGreeting('x'.repeat(MAX_NAME_LENGTH + 1), 0);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('birthday-name-length');
    const c = planBirthdayGreeting('Ada', 5);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('birthday-invalid-variant');
    const d = planBirthdayGreeting('Ada', 1.5);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe('birthday-invalid-variant');
    expect(GREETING_COUNT).toBe(5);
  });

  it('sends only on the birthday and only once per year', () => {
    const base = {
      todayMonthDay: '03-14',
      birthMonthDay: '03-14',
      lastSentYear: null,
      todayYear: 2026,
    };
    const send = shouldSendBirthday(base);
    expect(send.ok).toBe(true);
    if (send.ok) expect(send.value.send).toBe(true);
    const again = shouldSendBirthday({ ...base, lastSentYear: 2026 });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.send).toBe(false);
    const wrongDay = shouldSendBirthday({ ...base, todayMonthDay: '03-15' });
    expect(wrongDay.ok).toBe(true);
    if (wrongDay.ok) expect(wrongDay.value.send).toBe(false);
    const nextYear = shouldSendBirthday({ ...base, lastSentYear: 2026, todayYear: 2027 });
    expect(nextYear.ok).toBe(true);
    if (nextYear.ok) expect(nextYear.value.send).toBe(true);
  });

  it('refuses broken send decisions with named reasons', () => {
    const base = {
      todayMonthDay: '03-14',
      birthMonthDay: '03-14',
      lastSentYear: null,
      todayYear: 2026,
    };
    const a = shouldSendBirthday({ ...base, todayYear: 2026.5 });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('birthday-invalid-year');
    const b = shouldSendBirthday({ ...base, lastSentYear: 1800 });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('birthday-invalid-last-sent');
    const c = shouldSendBirthday({ ...base, birthMonthDay: 'wrong' });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('birthday-invalid-month-day');
  });

  it('pickVariant is deterministic and in range', () => {
    expect(pickVariant('Ada', 2026)).toBe(pickVariant('Ada', 2026));
    expect(pickVariant('Ada', 2026)).toBeGreaterThanOrEqual(0);
    expect(pickVariant('Ada', 2026)).toBeLessThan(GREETING_COUNT);
    for (const name of ['Ada', 'Grace', 'Linus', 'Guido']) {
      for (const year of [2026, 2027]) {
        const v = pickVariant(name, year);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(GREETING_COUNT);
      }
    }
  });

  it('sweeps 500 random decisions without breaking the once-per-year law', () => {
    const rng = mulberry32(42);
    const pad = (n: number): string => String(n).padStart(2, '0');
    for (let i = 0; i < 500; i++) {
      const birthMonth = 1 + Math.floor(rng() * 12);
      const birthDay = 1 + Math.floor(rng() * 28);
      const birth = pad(birthMonth) + '-' + pad(birthDay);
      const today = rng() < 0.5 ? birth : pad(1 + Math.floor(rng() * 12)) + '-' + pad(1 + Math.floor(rng() * 28));
      const year = 2026;
      const last = rng() < 0.5 ? null : 1900 + Math.floor(rng() * 200);
      const v = shouldSendBirthday({
        todayMonthDay: today,
        birthMonthDay: birth,
        lastSentYear: last,
        todayYear: year,
      });
      expect(v.ok).toBe(true);
      if (v.ok) {
        const expected = today === birth && last !== year;
        expect(v.value.send).toBe(expected);
      }
    }
  });
});
