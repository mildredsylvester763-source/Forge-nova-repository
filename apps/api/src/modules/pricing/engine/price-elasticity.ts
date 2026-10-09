// ============================================================================
// FILE: /apps/api/src/modules/pricing/engine/price-elasticity.ts
// ============================================================================
// Price elasticity estimator + price suggestion + pricing alerts (Feature 5;
// absorbs BizStack 26 "AI price suggestion" and 145 "smart pricing alerts").
// Pure: no DB, no clock, no network. The caller supplies the price-change
// observations (from experiments, sales history, or manual entry); the
// engine estimates demand elasticity and turns it into an honest suggestion.
//
// Value question: "if I move the price, what happens to units and revenue?"
// Micro-businesses price on fear. This engine prices on the only evidence
// that exists: what customers actually did when the price moved.
//
// Method (every choice has a written reason):
//   - ARC elasticity (midpoint formula): symmetric in both directions, so
//     a raise and the undoing cut measure the same magnitude.
//   - Observations are AGGREGATED BY MEDIAN, not mean: one panicked
//     sale-weekend cannot drag the estimate.
//   - Confidence is honest: fewer than 2 usable observations, or a change
//     too small to read (<5% price or <5% units), means the observation is
//     excluded — the engine refuses to advise loudly on whisper evidence.
//   - The suggestion sweeps a +/-20% band around the current price using the
//     constant-elasticity demand model q(p) = q0 * (p/p0)^E and picks the
//     projected revenue maximum WITHIN the band. Never outside: exotic
//     optima beyond observed territory are astrology.
//
// Contract: deterministic; unusable observations are excluded with a warning,
// never silently averaged; when evidence is thin the engine says so in the
// verdict instead of inventing a suggestion.

export interface PriceObservation {
  beforePrice: number;
  afterPrice: number;
  unitsBefore: number;
  unitsAfter: number;
}

export interface CurrentPriceContext {
  price: number;
  unitsPerPeriod: number;
  costPerUnit?: number | null;
}

export interface ElasticityResult {
  elasticity: number | null;
  classification: 'elastic' | 'inelastic' | 'unit' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  usableObservations: number;
  rejectedObservations: number;
  suggestedPrice: number | null;
  projectedRevenueAtSuggestion: number | null;
  projectedRevenueAtCurrent: number | null;
  verdict: string;
  alerts: string[]; // BZ 145: actionable pricing alerts, in plain words.
  warnings: string[];
}

const ELASTIC_LINE = 1.2; // |E| >= 1.2 : demand clearly reacts to price.
const INELASTIC_LINE = 0.8; // |E| <= 0.8 : demand barely reacts.
const MIN_READABLE_CHANGE = 0.05; // <5% price or unit change is noise.
const SWEEP_STEPS = 20; // +/-20% band, 1% steps.

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function arcElasticity(o: PriceObservation): number | null {
  const p0 = num(o.beforePrice), p1 = num(o.afterPrice);
  const q0 = num(o.unitsBefore), q1 = num(o.unitsAfter);
  if (p0 <= 0 || p1 <= 0 || q0 < 0 || q1 < 0) return null;
  const dP = (p1 - p0) / ((p0 + p1) / 2);
  const dQ = (q1 - q0) / ((q0 + q1) / 2);
  if (Math.abs(dP) < MIN_READABLE_CHANGE) return null;
  if (q0 + q1 <= 0) return null;
  if (Math.abs(dQ) < MIN_READABLE_CHANGE) return null;
  return dQ / dP;
}

export function estimateElasticity(
  observations: PriceObservation[],
  current: CurrentPriceContext,
): ElasticityResult {
  const obs = (observations || []).filter(o => o && o.beforePrice != null && o.afterPrice != null);
  const warnings: string[] = [];
  const elasticities: number[] = [];
  for (const o of obs) {
    const e = arcElasticity(o);
    if (e == null || !Number.isFinite(e)) continue;
    elasticities.push(e);
  }
  const rejected = obs.length - elasticities.length;
  if (rejected > 0) {
    warnings.push(rejected + ' observation(s) excluded — the price or unit change was under 5%, or the values were invalid. Whisper-level evidence is not evidence.');
  }

  const price = num(current.price);
  const units = num(current.unitsPerPeriod);
  const cost = current.costPerUnit != null ? num(current.costPerUnit) : null;

  if (!elasticities.length || price <= 0 || units <= 0) {
    return {
      elasticity: null,
      classification: 'unknown',
      confidence: 'low',
      usableObservations: elasticities.length,
      rejectedObservations: rejected,
      suggestedPrice: null,
      projectedRevenueAtSuggestion: null,
      projectedRevenueAtCurrent: null,
      verdict: 'Not enough readable price evidence yet — run a deliberate price experiment (at least a 5% move) before trusting any suggestion.',
      alerts: [],
      warnings,
    };
  }

  // Median-aggregate: one outlier cannot steer the estimate.
  const E = median(elasticities);
  const classification =
    Math.abs(E) >= ELASTIC_LINE ? 'elastic' : Math.abs(E) <= INELASTIC_LINE ? 'inelastic' : 'unit';

  // Confidence: observation count plus agreement between them.
  const mad = median(elasticities.map(e => Math.abs(e - E)));
  const agreement = elasticities.length >= 2 ? mad <= Math.max(0.3, Math.abs(E) * 0.5) : false;
  const confidence: 'low' | 'medium' | 'high' =
    elasticities.length >= 3 && agreement ? 'high' : elasticities.length >= 2 && agreement ? 'medium' : 'low';

  // Constant-elasticity sweep within +/-20% of the current price. With a
  // known unit cost the objective is CONTRIBUTION, not raw revenue — margin
  // is what a micro-business actually banks.
  let bestPrice = price;
  let bestRevenue = cost != null ? (price - cost) * units : price * units;
  for (let step = -SWEEP_STEPS; step <= SWEEP_STEPS; step++) {
    const p = Math.round(price * (1 + step / 100) * 100) / 100;
    if (p <= 0) continue;
    if (cost != null && p <= cost) continue; // never suggest below cost.
    const q = units * Math.pow(p / price, E);
    const objective = cost != null ? (p - cost) * q : p * q;
    if (objective > bestRevenue + 1e-9) {
      bestRevenue = objective;
      bestPrice = p;
    }
  }

  const baseline = cost != null ? (price - cost) * units : price * units;
  const improved = bestRevenue > baseline * 1.001;
  const suggestedPrice = improved ? bestPrice : null;
  const alerts: string[] = [];
  if (classification === 'inelastic') {
    alerts.push('Demand is inelastic (E = ' + E.toFixed(2) + ') — customers barely blinked at past price moves. A measured raise is the cheapest growth available.');
  } else if (classification === 'elastic') {
    alerts.push('Demand is elastic (E = ' + E.toFixed(2) + ') — price moves swing units hard. Compete on value and stickiness, not on price hikes.');
  } else {
    alerts.push('Demand is near unit-elastic (E = ' + E.toFixed(2) + ') — revenue is roughly flat across small moves; win volume elsewhere.');
  }
  if (suggestedPrice != null) {
    const dir = suggestedPrice > price ? 'raise' : 'cut';
    alerts.push('Suggestion: ' + dir + ' price from ' + price + ' to ' + suggestedPrice + ' — projected ' + (cost != null ? 'contribution' : 'revenue') + ' moves from ' + Math.round(baseline) + ' to ' + Math.round(bestRevenue) + ' per period.');
  } else {
    alerts.push('Current price is already at the projected optimum inside the +/-20% band — leave it alone.');
  }
  if (confidence === 'low') {
    alerts.push('Low confidence — too few observations or they disagree. Treat this as a hypothesis to test, not advice.');
  }

  return {
    elasticity: Math.round(E * 100) / 100,
    classification,
    confidence,
    usableObservations: elasticities.length,
    rejectedObservations: rejected,
    suggestedPrice,
    projectedRevenueAtSuggestion: suggestedPrice != null ? Math.round(bestRevenue) : null,
    projectedRevenueAtCurrent: Math.round(baseline),
    verdict: 'Median arc elasticity ' + E.toFixed(2) + ' across ' + elasticities.length + ' usable observation(s); ' + classification + ' demand, ' + confidence + ' confidence.',
    alerts,
    warnings,
  };
}
