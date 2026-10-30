// ============================================================================
// FILE: /apps/api/src/modules/birthdays/engine/birthday-messages.ts
// ============================================================================
// The birthday auto-message engine: pure decisions. Validates month-day
// shapes, decides whether today is the day and whether this year already
// got its message, picks a greeting deterministically, and never sends
// twice. Every refusal is named.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const MAX_NAME_LENGTH = 80;
export const GREETING_COUNT = 5;

const MONTH_DAY_PATTERN = /^\d{2}-\d{2}$/;

export function validateMonthDay(raw: unknown): Verdict<{ monthDay: string }> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'birthday-invalid-month-day' };
  }
  const trimmed = raw.trim();
  if (!MONTH_DAY_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'birthday-invalid-month-day' };
  }
  const month = Number(trimmed.slice(0, 2));
  const day = Number(trimmed.slice(3, 5));
  if (month < 1 || month > 12) {
    return { ok: false, reason: 'birthday-invalid-month' };
  }
  if (day < 1 || day > 31) {
    return { ok: false, reason: 'birthday-invalid-day' };
  }
  return { ok: true, value: { monthDay: trimmed } };
}

export function planBirthdayGreeting(
  name: unknown,
  variant: unknown,
): Verdict<{ message: string }> {
  if (typeof name !== 'string' || !name.trim().length) {
    return { ok: false, reason: 'birthday-invalid-name' };
  }
  const clean = name.trim();
  if (clean.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: 'birthday-name-length' };
  }
  if (
    typeof variant !== 'number' ||
    !Number.isInteger(variant) ||
    variant < 0 ||
    variant >= GREETING_COUNT
  ) {
    return { ok: false, reason: 'birthday-invalid-variant' };
  }
  const templates = [
    'Happy birthday, {name}! Wishing you a wonderful day.',
    'It is your day, {name}. Happy birthday!',
    'Another year wiser, {name}. Happy birthday.',
    'Happy birthday, {name}! Here is to a great year ahead.',
    'Sending warm wishes your way, {name}. Happy birthday!',
  ];
  return { ok: true, value: { message: templates[variant].split('{name}').join(clean) } };
}

export function shouldSendBirthday(input: {
  todayMonthDay: unknown;
  birthMonthDay: unknown;
  lastSentYear: unknown;
  todayYear: unknown;
}): Verdict<{ send: boolean }> {
  const today = validateMonthDay(input.todayMonthDay);
  if (!today.ok) return { ok: false, reason: today.reason };
  const birth = validateMonthDay(input.birthMonthDay);
  if (!birth.ok) return { ok: false, reason: birth.reason };
  if (
    typeof input.todayYear !== 'number' ||
    !Number.isInteger(input.todayYear) ||
    input.todayYear < 1970 ||
    input.todayYear > 3000
  ) {
    return { ok: false, reason: 'birthday-invalid-year' };
  }
  if (
    input.lastSentYear !== null &&
    (typeof input.lastSentYear !== 'number' ||
      !Number.isInteger(input.lastSentYear) ||
      input.lastSentYear < 1970 ||
      input.lastSentYear > 3000)
  ) {
    return { ok: false, reason: 'birthday-invalid-last-sent' };
  }
  const send =
    today.value.monthDay === birth.value.monthDay &&
    input.lastSentYear !== input.todayYear;
  return { ok: true, value: { send } };
}

// Deterministic greeting pick: same customer + same year always gets the
// same message, without storing the variant anywhere.
export function pickVariant(name: string, year: number): number {
  let hash = year;
  for (const ch of name.split('')) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 1000000007;
  }
  return hash % GREETING_COUNT;
}
