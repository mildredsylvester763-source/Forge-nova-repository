// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/fiscal-year.ts
// ============================================================================
// Pure fiscal-calendar math. No clock, no DB: every date is passed in. A
// fiscal year that starts in April puts February in the PRIOR fiscal year —
// the pin that catches off-by-one bugs.

export type FiscalVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface FiscalYear {
  key: string;
  startsAt: string;
  endsAtExclusive: string;
}

export function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    return null;
  }
  return d.getTime();
}

export function resolveFiscalYear(date: string, startMonth: number): FiscalVerdict<FiscalYear> {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    return { ok: false, reason: 'fiscal start month must be an integer between 1 and 12' };
  }
  const t = parseDay(date);
  if (t === null) {
    return { ok: false, reason: 'date must be a valid YYYY-MM-DD day' };
  }
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const fy = m >= startMonth ? y : y - 1;
  const starts = Date.UTC(fy, startMonth - 1, 1);
  const ends = Date.UTC(fy + 1, startMonth - 1, 1);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { ok: true, value: { key: 'FY' + fy, startsAt: iso(starts), endsAtExclusive: iso(ends) } };
}

export function periodOverlaps(
  existing: { startsAt: string; endsAtExclusive: string }[],
  startsAt: string,
  endsAtExclusive: string,
): string[] {
  return existing
    .filter((p) => p.startsAt < endsAtExclusive && startsAt < p.endsAtExclusive)
    .map((p) => p.startsAt + '..' + p.endsAtExclusive);
}
