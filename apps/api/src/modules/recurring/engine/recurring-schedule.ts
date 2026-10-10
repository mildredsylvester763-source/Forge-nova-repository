// ============================================================================
// FILE: /apps/api/src/modules/recurring/engine/recurring-schedule.ts
// ============================================================================
// Pure schedule math. No database, no clock — time is always passed in.
// Monthly and quarterly anchor days are clamped to the target month length
// (a 31st anchor lands on Feb 28/29, never skipped silently).

const DAY_MS = 86_400_000;

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly';

function finiteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

export function validateAnchor(
  frequency: RecurringFrequency,
  anchorDay: number,
): { ok: boolean; reason: string } {
  if (!finiteInt(anchorDay)) {
    return { ok: false, reason: 'anchor day must be an integer' };
  }
  if (frequency === 'weekly') {
    if (anchorDay < 0 || anchorDay > 6) {
      return { ok: false, reason: 'weekly anchor day must be 0 (Sunday) through 6 (Saturday)' };
    }
    return { ok: true, reason: 'weekly anchor ' + anchorDay };
  }
  if (anchorDay < 1 || anchorDay > 31) {
    return { ok: false, reason: frequency + ' anchor day must be 1 through 31' };
  }
  return { ok: true, reason: frequency + ' anchor day ' + anchorDay };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export interface Occurrence {
  next: Date;
  clamped: boolean;
  reason: string;
}

/** Next occurrence strictly AFTER `from`. */
export function nextOccurrence(
  from: Date,
  frequency: RecurringFrequency,
  anchorDay: number,
): Occurrence {
  if (frequency === 'weekly') {
    const delta = ((anchorDay - from.getUTCDay()) + 7) % 7 || 7;
    const next = new Date(from.getTime() + delta * DAY_MS);
    return { next, clamped: false, reason: 'weekly, +' + delta + ' day(s)' };
  }
  const step = frequency === 'quarterly' ? 3 : 1;
  const month = from.getUTCMonth() + step;
  const targetYear = from.getUTCFullYear() + Math.floor(month / 12);
  const targetMonth = month % 12;
  const full = daysInMonth(targetYear, targetMonth);
  const day = Math.min(anchorDay, full);
  const next = new Date(
    Date.UTC(targetYear, targetMonth, day, from.getUTCHours(), from.getUTCMinutes(), 0, 0),
  );
  const stamp =
    targetYear + '-' +
    String(targetMonth + 1).padStart(2, '0') + '-' +
    String(day).padStart(2, '0');
  return {
    next,
    clamped: day < anchorDay,
    reason:
      frequency + ', ' + stamp +
      (day < anchorDay ? ' (clamped from ' + anchorDay + ')' : ''),
  };
}

/** First occurrence ON OR AFTER `start`. */
export function firstOccurrence(
  start: Date,
  frequency: RecurringFrequency,
  anchorDay: number,
): Occurrence {
  if (frequency === 'weekly') {
    const delta = (anchorDay - start.getUTCDay() + 7) % 7;
    return {
      next: new Date(start.getTime() + delta * DAY_MS),
      clamped: false,
      reason: 'first weekly occurrence, +' + delta + ' day(s)',
    };
  }
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const full = daysInMonth(year, month);
  const day = Math.min(anchorDay, full);
  const candidate = Date.UTC(year, month, day, start.getUTCHours(), start.getUTCMinutes(), 0, 0);
  if (candidate >= start.getTime()) {
    return {
      next: new Date(candidate),
      clamped: day < anchorDay,
      reason: 'first occurrence this cycle',
    };
  }
  return nextOccurrence(start, frequency, anchorDay);
}

export interface RecurringProfileLike {
  frequency: RecurringFrequency;
  anchorDay: number;
  nextRunAt: Date;
  active: boolean;
}

export interface AdvanceResult {
  due: boolean;
  runAt: Date | null;
  nextRunAt: Date;
  clamped: boolean;
  reason: string;
}

/** Should the profile run right now? The clock is passed in, never read. */
export function advance(profile: RecurringProfileLike, now: Date): AdvanceResult {
  if (!profile.active) {
    return {
      due: false,
      runAt: null,
      nextRunAt: profile.nextRunAt,
      clamped: false,
      reason: 'profile is paused',
    };
  }
  if (profile.nextRunAt.getTime() > now.getTime()) {
    return {
      due: false,
      runAt: null,
      nextRunAt: profile.nextRunAt,
      clamped: false,
      reason: 'not due yet',
    };
  }
  const occurrence = nextOccurrence(profile.nextRunAt, profile.frequency, profile.anchorDay);
  return {
    due: true,
    runAt: profile.nextRunAt,
    nextRunAt: occurrence.next,
    clamped: occurrence.clamped,
    reason: 'due, next ' + occurrence.reason,
  };
}
