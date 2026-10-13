// ============================================================================
// FILE: /apps/api/src/modules/expenses/engine/expense-validate.ts
// ============================================================================
// Pure expense honesty: a description, positive integer cents, a parseable
// date, and no future-dating beyond one day of clock skew. No clock, no DB:
// 'now' is passed in.

export type ExpenseVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const DAY_MS = 86_400_000;

export function validateExpense(input: {
  description: string;
  amountCents: number;
  incurredAt: string;
  now: Date;
}): ExpenseVerdict<true> {
  if (!input.description || !input.description.trim()) {
    return { ok: false, reason: 'expense needs a description' };
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, reason: 'expense amount must be a positive integer number of cents' };
  }
  const t = Date.parse(input.incurredAt);
  if (Number.isNaN(t)) {
    return { ok: false, reason: 'expense date must be a valid ISO date' };
  }
  if (t > input.now.getTime() + DAY_MS) {
    return { ok: false, reason: 'expense cannot be dated more than a day into the future' };
  }
  return { ok: true, value: true };
}

export function normalizeCategory(raw?: string | null): string {
  const c = (raw ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return c || 'uncategorized';
}
