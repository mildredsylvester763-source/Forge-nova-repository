// ============================================================================
// FILE: /apps/api/src/modules/opportunities/scoring/signal-mapper.ts
// ============================================================================
// Raw scan signals → sub-scores. Pure: no DB, no clock, no network.
//
// Honesty contract: the mapper only produces a sub-score where a REAL
// signal exists for it. A source with no demand signal gets demand:
// undefined — computeScore() then lists it in missingSignals instead of
// inventing a number. Only demand and trend are derivable from raw scan
// signals today; competition, profitability, feasibility and seasonality
// require evidence no scanner has yet, so they stay missing.

import { ScoreInput } from './scoring.service';

function clamp10(v: number): number {
  return Math.min(10, Math.max(0, v));
}

// Log-scale mapping: 0 raw → 0, ~100 → 4, ~1k → 6, ~10k → 8, ~100k+ → 10.
// Monotonic and explainable: one order of magnitude ≈ two points.
function logDemand(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return clamp10(2 * Math.log10(1 + raw));
}

// Reddit upvote_ratio (0..1) maps to (-50..+50) growth in the scanner;
// rescale into 0..10 with 5 as the neutral midpoint.
function ratioToTrend(growthRate: number): number {
  if (!Number.isFinite(growthRate)) return 5;
  return clamp10((growthRate + 50) / 10);
}

// Percent growth (0..100+) maps linearly to 0..10.
function percentToTrend(growthRate: number): number {
  if (!Number.isFinite(growthRate)) return 5;
  return clamp10(growthRate / 10);
}

export function mapSignalsToSubScores(trendData: Record<string, any> | null | undefined): ScoreInput {
  const td = trendData || {};
  const twitter = td.twitter;
  const reddit = td.reddit;
  const github = td?.socialMedia?.github;

  if (twitter) {
    return {
      demand: logDemand(Number(twitter.mentions) || 0),
      trend: percentToTrend(Number(twitter.growthRate) || 0),
    };
  }
  if (reddit) {
    return {
      demand: logDemand((Number(reddit.upvotes) || 0) + (Number(reddit.comments) || 0)),
      trend: ratioToTrend(Number(reddit.growthRate) || 0),
    };
  }
  if (github) {
    return {
      demand: logDemand(Number(github.stars) || 0),
      trend: percentToTrend(Number(github.growthRate) || 0),
    };
  }
  // Google and unknown sources carry no numeric demand/trend signal yet:
  // everything stays missing rather than faked.
  return {};
}
