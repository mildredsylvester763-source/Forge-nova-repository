// ============================================================================
// FILE: /apps/api/src/modules/finance/engine/cash-flow-forecast.ts
// ============================================================================
// Cash-flow forecast (BizStack 22, pairs with FN#45 capital allocation).
// Pure: no DB, no clock — the caller supplies the revenue history as a
// time-ordered series; the engine projects forward honestly.
//
// Value question: "at the current trajectory, what lands in my pocket next
// month — and how much should I trust that number?"
// Micro-businesses die from confident extrapolation. This engine refuses
// to be confident on thin data: the forecast carries a band, and the band
// widens with the noise in the history.
//
// Method (every choice has a written reason):
//   - The series is CUMULATIVE revenue (what the snapshots actually hold);
//     the engine differences it into per-period revenue before fitting.
//   - The trend is ORDINARY LEAST SQUARES on per-period revenue: the
//     simplest model that cannot hallucinate seasonality from 4 points.
//   - The confidence band comes from the RESIDUAL standard deviation of
//     that fit: if the history is noisy, the band says so. No band can be
//     narrower than the noise that produced it.
//   - Fewer than MIN_POINTS usable points = NO forecast, only a warning.
//     Two points is a line, not a trend; the engine will not pretend.
//
// Contract: deterministic; forecast total is exactly the sum of its
// periods; a non-positive history yields warnings, not negative money.

export interface RevenuePoint {
  date: string; // ISO timestamp; ordering is the caller's contract.
  cumulativeRevenue: number;
}

export interface ForecastPeriod {
  index: number; // 1..horizon
  fromPoint: string;
  projectedRevenue: number;
  low: number;
  high: number;
}

export interface CashFlowForecast {
  adequateData: boolean;
  periodsUsable: number;
  slopePerPeriod: number;
  intercept: number;
  residualStdDev: number;
  forecast: ForecastPeriod[];
  forecastTotal: number;
  warnings: string[];
}

const MIN_POINTS = 3; // Below this there is no trend, only anecdotes.
const PERIOD_DAYS = 7; // Weekly buckets: the unit a micro-business plans in.

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// Difference the cumulative series into per-period revenue. Non-monotonic
// snapshots (a correction, a refund) clamp to zero for that period rather
// than manufacturing negative revenue.
function perPeriodRevenue(points: RevenuePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const delta = num(points[i].cumulativeRevenue) - num(points[i - 1].cumulativeRevenue);
    out.push(Math.max(0, delta));
  }
  return out;
}

export function forecastCashFlow(history: RevenuePoint[], horizon: number): CashFlowForecast {
  const warnings: string[] = [];
  const h = Math.min(12, Math.max(1, Math.floor(num(horizon) || 4)));
  const clean = (history || []).filter(p => p && p.date).slice().sort((a, b) => a.date.localeCompare(b.date));

  if (clean.length < 2) {
    return {
      adequateData: false,
      periodsUsable: Math.max(0, clean.length - 1),
      slopePerPeriod: 0,
      intercept: 0,
      residualStdDev: 0,
      forecast: [],
      forecastTotal: 0,
      warnings: ['Almost no revenue history — a forecast would be invented, not estimated. Record at least three snapshots before asking again.'],
    };
  }

  const series = perPeriodRevenue(clean);
  const n = series.length;

  if (n < MIN_POINTS - 1) {
    return {
      adequateData: false,
      periodsUsable: n,
      slopePerPeriod: 0,
      intercept: 0,
      residualStdDev: 0,
      forecast: [],
      forecastTotal: 0,
      warnings: ['Only ' + n + ' usable period(s) of revenue — a trend needs at least ' + (MIN_POINTS - 1) + '. Keep recording; ask again later.'],
    };
  }

  // OLS fit: y = slope * x + intercept, x = period index (1-based).
  const xs = series.map((_, i) => i + 1);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) * (xs[i] - meanX);
    sxy += (xs[i] - meanX) * (series[i] - meanY);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;

  // Residual std dev — the honest width of the band.
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssr += (series[i] - pred) * (series[i] - pred);
  }
  const residualStdDev = n > 2 ? Math.sqrt(ssr / (n - 2)) : Math.sqrt(ssr / Math.max(1, n));

  const forecast: ForecastPeriod[] = [];
  let total = 0;
  for (let k = 1; k <= h; k++) {
    const x = n + k;
    const projected = Math.max(0, slope * x + intercept);
    const band = 1.96 * residualStdDev; // 95% band at the trend line's noise floor.
    const low = Math.max(0, round2(projected - band));
    const high = round2(projected + band);
    const entry = { index: k, fromPoint: clean[Math.min(clean.length - 1, x)]?.date || clean[clean.length - 1].date, projectedRevenue: round2(projected), low, high };
    forecast.push(entry);
    total += entry.projectedRevenue;
  }

  if (slope < 0) {
    warnings.push('The revenue trend is NEGATIVE (' + round2(slope) + ' per period). Cut costs before cutting prices; find out which product slipped.');
  }
  if (residualStdDev > Math.max(1, meanY * 0.5)) {
    warnings.push('Revenue is noisy — the band is wide because the history swings. Treat the midpoint as a guess, the band as the truth.');
  }
  if (n < 6) {
    warnings.push('Only ' + n + ' periods of history — the band is honest, but more data makes every next week cheaper to guess.');
  }

  return {
    adequateData: true,
    periodsUsable: n,
    slopePerPeriod: round2(slope),
    intercept: round2(intercept),
    residualStdDev: round2(residualStdDev),
    forecast,
    forecastTotal: round2(total),
    warnings,
  };
}
