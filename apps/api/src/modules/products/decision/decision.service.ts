// ============================================================================
// FILE: /apps/api/src/modules/products/decision/decision.service.ts
// ============================================================================
// The kill/scale/pivot decision engine. Pure functions only: no database,
// no network, no clock — persistence and timestamps live in the caller
// (ProductsService.decideProduct). Same discipline as the scoring engine.
//
// Value question: “given what this product has actually earned, what should
// the owner do about it TODAY?”
// Baseline beaten: doing nothing (a portfolio board the owner must re-derive
// by hand every week; proven in decision.service.spec).
//
// Contract:
//   - Deterministic: same input, same verdict, same confidence, forever.
//   - Fail-visible: every evaluated rule is returned in factors, including
//     the ones that did NOT fire — the owner sees the whole rule set, not
//     just the conclusion.
//   - No fake confidence: a product without market data or without a full
//     observation window is HOLD, never a guessed KILL or SCALE.

import {
  DECISION_MIN_OBSERVATION_DAYS,
  DECISION_KILL_REVENUE_FLOOR,
  DECISION_SCALE_REVENUE_THRESHOLD,
  DECISION_SCALE_MIN_ORDERS,
  DECISION_PIVOT_MIN_REVENUE,
  DECISION_PIVOT_MAX_ORDERS,
  DECIDABLE_STATUSES,
  VERDICT_ACTIONS,
  VERDICT_PRIORITY,
  Verdict,
} from './decision.config';

export interface DecisionInput {
  // Product lifecycle status, e.g. ProductStatus.LIVE. Kept as a plain
  // string so this module never depends on the entity layer.
  status: string;
  revenue: number;
  orders: number;
  averageOrderValue?: number;
  // Days since the product was created (the observation window clock).
  ageDays: number;
}

export interface DecisionFactor {
  key: string;
  passed: boolean;
  detail: string;
}

export interface DecisionResult {
  verdict: Verdict;
  action: string;
  // 0-100. Confidence is earned: base 60 for a clean rule hit, up to +40
  // by how decisively the input cleared (or missed) its threshold.
  confidence: number;
  reasons: string[];
  factors: DecisionFactor[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function build(
  verdict: Verdict,
  confidence: number,
  reasons: string[],
  factors: DecisionFactor[],
): DecisionResult {
  return {
    verdict,
    action: VERDICT_ACTIONS[verdict],
    confidence: round2(clamp(confidence, 0, 100)),
    reasons,
    factors,
  };
}

export function decide(input: DecisionInput): DecisionResult {
  const factors: DecisionFactor[] = [];
  const reasons: string[] = [];

  // Rule 1 — market data. A product that never went live has no evidence;
  // the engine says so instead of inventing a verdict.
  const hasMarketData = (DECIDABLE_STATUSES as readonly string[]).includes(input.status);
  factors.push({
    key: 'market_data',
    passed: hasMarketData,
    detail: hasMarketData
      ? 'Status ' + input.status + ' has live market data.'
      : 'Status ' + input.status + ' has no live market data — nothing to decide yet.',
  });
  if (!hasMarketData) {
    reasons.push('Status ' + input.status + ' is pre-market: the engine does not guess before evidence exists.');
    return build('HOLD', 0, reasons, factors);
  }

  // Rule 2 — observation window. Deciding inside the window is noise.
  const observed = input.ageDays >= DECISION_MIN_OBSERVATION_DAYS;
  factors.push({
    key: 'observation_window',
    passed: observed,
    detail: observed
      ? input.ageDays + ' days observed (window is ' + DECISION_MIN_OBSERVATION_DAYS + ').'
      : 'Only ' + input.ageDays + ' of ' + DECISION_MIN_OBSERVATION_DAYS + ' days observed.',
  });
  if (!observed) {
    reasons.push('Only ' + input.ageDays + ' days of observation — the window is ' + DECISION_MIN_OBSERVATION_DAYS + '; deciding now would be reading launch noise as signal.');
    return build('HOLD', 0, reasons, factors);
  }

  // Rule 3 — KILL. Failed the market test outright.
  const kill = input.revenue < DECISION_KILL_REVENUE_FLOOR;
  factors.push({
    key: 'kill_floor',
    passed: kill,
    detail: 'Revenue ' + input.revenue + ' vs kill floor ' + DECISION_KILL_REVENUE_FLOOR + '.',
  });
  if (kill) {
    const decisiveness = ((DECISION_KILL_REVENUE_FLOOR - input.revenue) / DECISION_KILL_REVENUE_FLOOR) * 40;
    reasons.push('After ' + input.ageDays + ' days live, revenue ' + input.revenue + ' never cleared the ' + DECISION_KILL_REVENUE_FLOOR + ' floor — the market already voted.');
    return build('KILL', 60 + decisiveness, reasons, factors);
  }

  // Rule 4 — SCALE. Both money and repeat proof.
  const scale = input.revenue >= DECISION_SCALE_REVENUE_THRESHOLD && input.orders >= DECISION_SCALE_MIN_ORDERS;
  factors.push({
    key: 'scale_threshold',
    passed: scale,
    detail: 'Revenue ' + input.revenue + '/' + DECISION_SCALE_REVENUE_THRESHOLD + ', orders ' + input.orders + '/' + DECISION_SCALE_MIN_ORDERS + '.',
  });
  if (scale) {
    const decisiveness =
      Math.min(1, input.revenue / DECISION_SCALE_REVENUE_THRESHOLD) * 20 +
      Math.min(1, input.orders / DECISION_SCALE_MIN_ORDERS) * 20;
    reasons.push('Revenue ' + input.revenue + ' across ' + input.orders + ' orders — demand is broad and real; scaling beats hesitating.');
    return build('SCALE', 60 + decisiveness, reasons, factors);
  }

  // Rule 5 — PIVOT. Demand exists but the offer shape is wrong.
  const pivot = input.revenue >= DECISION_PIVOT_MIN_REVENUE && input.orders <= DECISION_PIVOT_MAX_ORDERS;
  factors.push({
    key: 'pivot_shape',
    passed: pivot,
    detail: 'Revenue ' + input.revenue + ' vs pivot min ' + DECISION_PIVOT_MIN_REVENUE + ', orders ' + input.orders + ' vs pivot max ' + DECISION_PIVOT_MAX_ORDERS + '.',
  });
  if (pivot) {
    const decisiveness = Math.min(40, ((input.revenue - DECISION_PIVOT_MIN_REVENUE) / DECISION_PIVOT_MIN_REVENUE) * 40);
    reasons.push('Revenue ' + input.revenue + ' from only ' + input.orders + ' orders — people pay, but too few; the offer, not the work, is the problem.');
    return build('PIVOT', 60 + decisiveness, reasons, factors);
  }

  // No rule fired — the honest middle: alive, earning, unremarkable.
  reasons.push('Revenue ' + input.revenue + ' and ' + input.orders + ' orders sit between every threshold — no rule fired, so the honest verdict is HOLD, not a guess.');
  return build('HOLD', 50, reasons, factors);
}

// Portfolio ordering: SCALE and KILL first (both demand action today),
// then PIVOT, then HOLD. Stable sort — equal verdicts keep input order.
export function rankByVerdict<T>(items: T[], verdictOf: (item: T) => Verdict): T[] {
  return [...items].sort((a, b) => VERDICT_PRIORITY[verdictOf(a)] - VERDICT_PRIORITY[verdictOf(b)]);
}