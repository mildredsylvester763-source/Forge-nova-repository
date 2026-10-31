// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/engine/costing-engine.ts
// ============================================================================
// Pure costing rules for weighted-average cost and margins. No database, no
// Nest; every refusal is named. Money is always integer cents.

export const MAX_COSTABLE_QTY = 10000000;
export const MAX_MONEY_CENTS = 100000000;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validateCostQty(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, reason: 'cost-invalid-qty' };
  }
  if (raw > MAX_COSTABLE_QTY) {
    return { ok: false, reason: 'cost-qty-too-large' };
  }
  return { ok: true, value: raw };
}

export function validateUnitCostCents(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, reason: 'cost-invalid-unit-cost' };
  }
  if (raw > MAX_MONEY_CENTS) {
    return { ok: false, reason: 'cost-unit-cost-too-large' };
  }
  return { ok: true, value: raw };
}

export function validateSellPriceCents(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, reason: 'cost-invalid-sell-price' };
  }
  if (raw > MAX_MONEY_CENTS) {
    return { ok: false, reason: 'cost-sell-price-too-large' };
  }
  return { ok: true, value: raw };
}

// Weighted average cost after receiving recvQty more units at recvCostCents
// each. prevQty is the running costed quantity, prevAvgCents its average.
export function weightedAverageCost(
  prevQty: number,
  prevAvgCents: number,
  recvQty: number,
  recvCostCents: number,
): Verdict<number> {
  if (
    typeof prevQty !== 'number' ||
    typeof prevAvgCents !== 'number' ||
    typeof recvQty !== 'number' ||
    typeof recvCostCents !== 'number' ||
    prevQty < 0 ||
    prevAvgCents < 0 ||
    recvQty < 1 ||
    recvCostCents < 1
  ) {
    return { ok: false, reason: 'cost-invalid-receipt' };
  }
  const newQty = prevQty + recvQty;
  if (newQty > MAX_COSTABLE_QTY) {
    return { ok: false, reason: 'cost-qty-too-large' };
  }
  const totalCents = prevQty * prevAvgCents + recvQty * recvCostCents;
  const avg = Math.round(totalCents / newQty);
  return { ok: true, value: avg };
}

export interface MarginSnapshot {
  sellPriceCents: number;
  avgCostCents: number;
  profitCents: number;
  marginPct: number;
  markupPct: number | null;
}

// Honest margins: without a sell price or a recorded cost there is no margin,
// so the answer is null, never a guessed number. Negative margins are real
// data and are reported as they are.
export function marginSnapshot(
  sellPriceCents: number | null,
  avgCostCents: number | null,
): MarginSnapshot | null {
  if (sellPriceCents === null || avgCostCents === null) {
    return null;
  }
  if (typeof sellPriceCents !== 'number' || typeof avgCostCents !== 'number') {
    return null;
  }
  if (sellPriceCents < 1 || avgCostCents < 0) {
    return null;
  }
  const profitCents = sellPriceCents - avgCostCents;
  const marginPct = Math.round((profitCents * 10000) / sellPriceCents) / 100;
  const markupPct = avgCostCents === 0 ? null : Math.round((profitCents * 10000) / avgCostCents) / 100;
  return { sellPriceCents, avgCostCents, profitCents, marginPct, markupPct };
}
