// ============================================================================
// Pure churn-risk engine. Weights follow the churn signals the market
// (ChartMogul, Baremetrics, ChurnZero, ProfitWell) uses for small-business
// customer health: inactivity, overdue invoices and their severity, a
// detractor NPS score, and declining spend. Each signal adds a fixed number
// of points and a named factor; the band comes from the total.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const CHURN_INACTIVITY_DAYS = 90;
export const CHURN_INACTIVITY_POINTS = 30;
export const CHURN_OVERDUE_POINTS = 20;
export const CHURN_OVERDUE_SEVERITY_DAYS = 30;
export const CHURN_OVERDUE_SEVERITY_POINTS = 10;
export const CHURN_NPS_DETRACTOR_POINTS = 25;
export const CHURN_DECLINING_SPEND_PERCENT = -20;
export const CHURN_DECLINING_SPEND_POINTS = 15;
export const CHURN_MEDIUM_THRESHOLD = 25;
export const CHURN_HIGH_THRESHOLD = 50;

export function validateInactivity(days: number): Verdict<number> {
  if (!Number.isInteger(days) || days < 0) {
    return { ok: false, reason: 'churn-invalid-inactivity' };
  }
  return { ok: true, value: days };
}

export function validateTrend(percent: number): Verdict<number> {
  if (!Number.isInteger(percent) || percent < -100 || percent > 100) {
    return { ok: false, reason: 'churn-invalid-trend' };
  }
  return { ok: true, value: percent };
}

export function validateNpsScore(score: number | null): Verdict<number | null> {
  if (score === null) return { ok: true, value: null };
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return { ok: false, reason: 'churn-invalid-nps' };
  }
  return { ok: true, value: score };
}

export interface ChurnInput {
  daysSinceLastInteraction: number;
  overdueInvoiceCount: number;
  maxDaysOverdue: number;
  spendTrendPercent: number;
  latestNpsScore: number | null;
}

export interface ChurnRisk {
  band: 'low' | 'medium' | 'high';
  points: number;
  factors: string[];
}

export function scoreChurnRisk(input: ChurnInput): Verdict<ChurnRisk> {
  const inactivity = validateInactivity(input.daysSinceLastInteraction);
  if (!inactivity.ok) return inactivity;
  if (!Number.isInteger(input.overdueInvoiceCount) || input.overdueInvoiceCount < 0) {
    return { ok: false, reason: 'churn-invalid-overdue-count' };
  }
  if (!Number.isInteger(input.maxDaysOverdue) || input.maxDaysOverdue < 0) {
    return { ok: false, reason: 'churn-invalid-overdue-days' };
  }
  const trend = validateTrend(input.spendTrendPercent);
  if (!trend.ok) return trend;
  const nps = validateNpsScore(input.latestNpsScore);
  if (!nps.ok) return nps;

  const factors: string[] = [];
  let points = 0;
  if (input.daysSinceLastInteraction > CHURN_INACTIVITY_DAYS) {
    points += CHURN_INACTIVITY_POINTS;
    factors.push('churn-factor-inactivity');
  }
  if (input.overdueInvoiceCount > 0) {
    points += CHURN_OVERDUE_POINTS;
    factors.push('churn-factor-overdue-invoices');
  }
  if (input.maxDaysOverdue > CHURN_OVERDUE_SEVERITY_DAYS) {
    points += CHURN_OVERDUE_SEVERITY_POINTS;
    factors.push('churn-factor-overdue-severity');
  }
  if (input.latestNpsScore !== null && input.latestNpsScore <= 6) {
    points += CHURN_NPS_DETRACTOR_POINTS;
    factors.push('churn-factor-nps-detractor');
  }
  if (input.spendTrendPercent <= CHURN_DECLINING_SPEND_PERCENT) {
    points += CHURN_DECLINING_SPEND_POINTS;
    factors.push('churn-factor-declining-spend');
  }
  const band: ChurnRisk['band'] =
    points >= CHURN_HIGH_THRESHOLD ? 'high' : points >= CHURN_MEDIUM_THRESHOLD ? 'medium' : 'low';
  return { ok: true, value: { band, points, factors } };
}
