// ============================================================================
// FILE: /apps/api/src/modules/opportunities/scoring/scoring.config.ts
// ============================================================================
// The single tuning surface for the scoring engine. Every weight and
// threshold has a written reason — no magic numbers, ever.

export const SUB_SCORE_MIN = 0;
export const SUB_SCORE_MAX = 10;
export const COMPOSITE_MIN = 0;
export const COMPOSITE_MAX = 100;

// Neutral stand-in when a signal source is missing. Never faked as real:
// computeScore() lists every defaulted factor in missingSignals.
export const DEFAULT_SUB_SCORE = 5;

export const SUB_SCORE_KEYS = [
  'demand',
  'competition',
  'profitability',
  'feasibility',
  'trend',
  'seasonality',
] as const;
export type SubScoreKey = typeof SUB_SCORE_KEYS[number];

// Weights sum to exactly 1.00 (pinned by test).
export const SUB_SCORE_WEIGHTS: Record<SubScoreKey, number> = {
  // No demand, nothing else matters — the heaviest weight.
  demand: 0.25,
  // Money-in core: the whole point of the platform.
  profitability: 0.20,
  // An opportunity the user cannot execute is worth zero.
  feasibility: 0.20,
  // Crowded markets compress margins, but a crowded market with real
  // demand can still be won — mid weight.
  competition: 0.15,
  // Momentum compounds, but present demand outweighs it.
  trend: 0.12,
  // Timing risk only — the smallest, honest weight.
  seasonality: 0.08,
};

export const GRADE_THRESHOLDS = [
  { min: 75, grade: 'A', action: 'PURSUE_NOW', reason: 'Strong across enough factors to start building today.' },
  { min: 60, grade: 'B', action: 'VALIDATE', reason: 'Promising — run one targeted validation before committing.' },
  { min: 40, grade: 'C', action: 'PARK', reason: 'Weak or incomplete signals — park it; the next scan improves the board.' },
  { min: 0, grade: 'D', action: 'KILL', reason: 'Consistently low — killing it is the cheapest decision.' },
] as const;
