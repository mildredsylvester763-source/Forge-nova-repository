// ============================================================================
// FILE: /apps/api/src/modules/opportunities/scoring/scoring.service.ts
// ============================================================================
// The scoring engine. Pure functions only: nothing here touches the
// database, the network, or the clock. Persistence happens in the caller.
//
// Value question: "which opportunity should the user pursue first?"
// Baseline beaten: newest-first ordering (proven in scoring.service.spec:
// a high-signal opportunity created earlier outranks a newer weak one).
//
// Contract:
//   - Every sub-score clamped to [0, 10]; composite to [0, 100].
//   - Missing / NaN signals degrade to DEFAULT_SUB_SCORE and are listed
//     in missingSignals — fail visible, never faked as real data.
//   - Deterministic: same input, same output, forever.

import {
  SUB_SCORE_KEYS,
  SUB_SCORE_WEIGHTS,
  SUB_SCORE_MIN,
  SUB_SCORE_MAX,
  DEFAULT_SUB_SCORE,
  COMPOSITE_MIN,
  COMPOSITE_MAX,
  GRADE_THRESHOLDS,
  SubScoreKey,
} from './scoring.config';

export interface ScoreInput {
  demand?: number;
  competition?: number;
  profitability?: number;
  feasibility?: number;
  trend?: number;
  seasonality?: number;
}

export interface ScoreFactor {
  key: SubScoreKey;
  value: number;
  weight: number;
  contribution: number;
  source: 'provided' | 'defaulted';
}

export interface ScoreGrade {
  grade: 'A' | 'B' | 'C' | 'D';
  action: 'PURSUE_NOW' | 'VALIDATE' | 'PARK' | 'KILL';
  reason: string;
}

export interface ScoreResult extends ScoreGrade {
  composite: number;
  factors: ScoreFactor[];
  missingSignals: SubScoreKey[];
}

// Clamp any incoming sub-score into [0, 10]; null/undefined/NaN degrade
// to the neutral default so a partially-populated board still scores.
export function normalizeSubScore(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SUB_SCORE;
  }
  return Math.min(SUB_SCORE_MAX, Math.max(SUB_SCORE_MIN, value));
}

export function gradeFor(composite: number): ScoreGrade {
  const clamped = Math.min(COMPOSITE_MAX, Math.max(COMPOSITE_MIN, composite));
  const bucket = GRADE_THRESHOLDS.find(t => clamped >= t.min);
  // GRADE_THRESHOLDS bottoms out at 0, so a bucket always exists.
  const t = bucket ?? GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
  return { grade: t.grade, action: t.action, reason: t.reason };
}

export function computeScore(input: ScoreInput): ScoreResult {
  const factors: ScoreFactor[] = [];
  const missingSignals: SubScoreKey[] = [];
  let total = 0;
  for (const key of SUB_SCORE_KEYS) {
    const raw = input[key];
    const provided = typeof raw === 'number' && Number.isFinite(raw);
    const value = normalizeSubScore(raw);
    if (!provided) missingSignals.push(key);
    const weight = SUB_SCORE_WEIGHTS[key];
    const contribution = weight * value;
    total += contribution;
    factors.push({ key, value, weight, contribution, source: provided ? 'provided' : 'defaulted' });
  }
  const composite =
    Math.min(COMPOSITE_MAX, Math.max(COMPOSITE_MIN, Math.round(total * 10 * 100) / 100));
  return { composite, ...gradeFor(composite), factors, missingSignals };
}

// Descending by score. Array.prototype.sort is stable in Node, so equal
// scores keep their original order — rankings never shuffle on re-run.
export function rankByScore<T>(items: T[], scoreOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => scoreOf(b) - scoreOf(a));
}
