// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/period-close.ts
// ============================================================================
// Pure period-close discipline. Closing is a decision, not a mutation of
// history: journals are immutable, so a closed period only records that the
// books were reviewed and frozen at a moment in time.

export type CloseVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface PeriodLike {
  startsAt: Date;
  endsAt: Date;
  closedAt?: Date | null;
}

export interface JournalSummaryRow {
  occurredAt: Date;
  sourceType: string;
  totalCents: number;
}

export interface PeriodSummary {
  journalCount: number;
  bySource: Record<string, { journalCount: number; totalCents: number }>;
}

export function validateClose(period: PeriodLike, now: Date): CloseVerdict<true> {
  if (period.closedAt) {
    return { ok: false, reason: 'period is already closed' };
  }
  if (period.endsAt.getTime() <= period.startsAt.getTime()) {
    return { ok: false, reason: 'period end must be after its start' };
  }
  if (now.getTime() < period.endsAt.getTime()) {
    return { ok: false, reason: 'period has not ended yet — close it on or after the end date' };
  }
  return { ok: true, value: true };
}

export function periodSummary(
  journals: JournalSummaryRow[],
  startsAt: Date,
  endsAt: Date,
): PeriodSummary {
  const inside = journals.filter((j) => j.occurredAt >= startsAt && j.occurredAt < endsAt);
  const bySource: Record<string, { journalCount: number; totalCents: number }> = {};
  for (const j of inside) {
    bySource[j.sourceType] = bySource[j.sourceType] || { journalCount: 0, totalCents: 0 };
    bySource[j.sourceType].journalCount += 1;
    bySource[j.sourceType].totalCents += j.totalCents;
  }
  return { journalCount: inside.length, bySource };
}
