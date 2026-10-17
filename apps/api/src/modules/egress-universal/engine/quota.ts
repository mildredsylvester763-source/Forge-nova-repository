// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/quota.ts
// ============================================================================
// Egress quota accounting, in integer call-units. Tiers pin a monthly
// budget; consumption is monotonic within a month key; going over is a
// named refusal — never a silent throttle drop. Pure: no DB, no clock.

export type Verdict<T> = { ok: true; value: T } | { ok: false, reason: string };

export type QuotaTier = 'free' | 'basic' | 'pro';

export const TIER_BUDGETS: Record<QuotaTier, number> = {
  free: 500,
  basic: 5000,
  pro: 50000,
};

export function monthKey(isoDate: string): Verdict<{ key: string }> {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(isoDate)) {
    return { ok: false, reason: 'quota-invalid-date' };
  }
  return { ok: true, value: { key: isoDate.slice(0, 7) } };
}

export function validateTier(tier: string): Verdict<QuotaTier> {
  if (tier === 'free' || tier === 'basic' || tier === 'pro') {
    return { ok: true, value: tier };
  }
  return { ok: false, reason: 'quota-unknown-tier:' + String(tier) };
}

export interface ConsumeResult {
  used: number;
  budget: number;
  remaining: number;
}

export function consume(tier: QuotaTier, used: number, units: number, month: string, currentMonth: string): Verdict<ConsumeResult> {
  if (!Number.isInteger(used) || used < 0) return { ok: false, reason: 'quota-invalid-used' };
  if (!Number.isInteger(units) || units <= 0) return { ok: false, reason: 'quota-invalid-units' };
  if (month !== currentMonth) return { ok: false, reason: 'quota-stale-month' };
  const budget = TIER_BUDGETS[tier];
  const effectiveUsed = used;
  if (effectiveUsed + units > budget) {
    return { ok: false, reason: 'quota-exceeded' };
  }
  return {
    ok: true,
    value: { used: effectiveUsed + units, budget, remaining: budget - (effectiveUsed + units) },
  };
}

// Burn-rate projection: given units used partway through the month, will
// the budget last? daysElapsed must be within the month's days.
export function projectBurn(used: number, budget: number, daysElapsed: number, daysInMonth: number): Verdict<{ projected: number; overPace: boolean }> {
  if (!Number.isInteger(used) || used < 0) return { ok: false, reason: 'quota-invalid-used' };
  if (!Number.isInteger(budget) || budget <= 0) return { ok: false, reason: 'quota-invalid-budget' };
  if (!Number.isInteger(daysElapsed) || daysElapsed < 0 || daysElapsed > daysInMonth) {
    return { ok: false, reason: 'quota-invalid-elapsed' };
  }
  if (!Number.isInteger(daysInMonth) || daysInMonth < 28 || daysInMonth > 31) {
    return { ok: false, reason: 'quota-invalid-month-length' };
  }
  if (daysElapsed === 0) return { ok: true, value: { projected: used, overPace: false } };
  const projected = Math.ceil((used / daysElapsed) * daysInMonth);
  return { ok: true, value: { projected, overPace: projected > budget } };
}
