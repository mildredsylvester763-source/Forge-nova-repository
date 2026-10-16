// ============================================================================
// FILE: /apps/api/src/modules/budgets/engine/budget-variance.ts
// ============================================================================

// Budget vs actual. Variance is budget minus actual: positive means under
// budget (good), negative means overspend. Zero-budget with nonzero spend
// is a named refusal, never an infinite percentage.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface BudgetVariance {
  varianceCents: number;
  variancePct: number;
  status: 'under' | 'over' | 'on';
}

export function budgetVariance(budgetCents: number, actualCents: number): Verdict<BudgetVariance> {
  if (budgetCents < 0) return { ok: false, reason: 'budget-negative-amount' };
  if (actualCents < 0) return { ok: false, reason: 'actual-negative-amount' };
  if (budgetCents === 0 && actualCents !== 0) return { ok: false, reason: 'budget-zero-division' };
  const varianceCents = budgetCents - actualCents;
  const variancePct = budgetCents === 0 ? 0 : Math.round((varianceCents / budgetCents) * 10000) / 100;
  return {
    ok: true,
    value: {
      varianceCents,
      variancePct,
      status: varianceCents > 0 ? 'under' : varianceCents < 0 ? 'over' : 'on',
    },
  };
}
