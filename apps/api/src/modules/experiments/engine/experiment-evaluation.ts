// ============================================================================
// FILE: /apps/api/src/modules/experiments/engine/experiment-evaluation.ts
// ============================================================================
// Pure experiment verdict engine. No DB, no clock, no network — the caller
// (ExperimentsService) owns persistence and timestamps. Same discipline as
// the scoring and decision engines.
//
// Value question: “did the variant beat the baseline by enough, on enough
// evidence, to act on it today?”
// Baseline beaten: eyeballing two raw numbers — the engine computes lift,
// guards against tiny samples, and returns the same verdict for the same
// numbers, forever.
//
// Contract:
//   - Deterministic: same observations, same verdict, same explanation.
//   - Fail-visible: a missing arm, zero visitors, or an insufficient
//     sample returns INCONCLUSIVE with the reason named — never a guessed
//     WIN or LOSE.
//   - Minimum sample: both arms need at least MIN_VISITORS_PER_ARM before
//     any win/lose is allowed. Small samples prove nothing.

export const MIN_VISITORS_PER_ARM = 30;

export interface ExperimentArm {
  visitors: number;
  conversions: number;
}

export interface EvaluationFactor {
  key: string;
  passed: boolean;
  detail: string;
}

export interface EvaluationResult {
  verdict: 'win' | 'lose' | 'inconclusive';
  baselineRate: number | null;
  variantRate: number | null;
  relativeLift: number | null;
  reasons: string[];
  factors: EvaluationFactor[];
}

function rate(arm: ExperimentArm): number | null {
  if (!Number.isFinite(arm.visitors) || arm.visitors <= 0) return null;
  if (!Number.isFinite(arm.conversions) || arm.conversions < 0) return null;
  if (arm.conversions > arm.visitors) return null;
  return arm.conversions / arm.visitors;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function evaluateExperiment(
  baseline: ExperimentArm,
  variant: ExperimentArm,
  successThreshold: number,
): EvaluationResult {
  const factors: EvaluationFactor[] = [];
  const reasons: string[] = [];

  // Rule 1 — both arms must have computable rates.
  const bRate = rate(baseline);
  const vRate = rate(variant);
  const ratesOk = bRate !== null && vRate !== null;
  factors.push({
    key: 'rates_computable',
    passed: ratesOk,
    detail: ratesOk
      ? 'baseline ' + round4(bRate!) + ' vs variant ' + round4(vRate!) + '.'
      : 'an arm has zero visitors, negative conversions, or conversions > visitors — nothing to compare.',
  });
  if (!ratesOk) {
    reasons.push('Conversion rates are not computable for both arms — recording an observation as a verdict would be inventing data.');
    return { verdict: 'inconclusive', baselineRate: bRate, variantRate: vRate, relativeLift: null, reasons, factors };
  }

  // Rule 2 — minimum sample on BOTH arms before any win/lose.
  const sampleOk = baseline.visitors >= MIN_VISITORS_PER_ARM && variant.visitors >= MIN_VISITORS_PER_ARM;
  factors.push({
    key: 'min_sample',
    passed: sampleOk,
    detail: 'baseline ' + baseline.visitors + ' / variant ' + variant.visitors + ' visitors (minimum ' + MIN_VISITORS_PER_ARM + ' per arm).',
  });
  if (!sampleOk) {
    reasons.push('Sample too small (needs ' + MIN_VISITORS_PER_ARM + '+ visitors per arm; baseline has ' + baseline.visitors + ', variant ' + variant.visitors + ') — small samples prove nothing, so the honest verdict is inconclusive.');
    return { verdict: 'inconclusive', baselineRate: bRate, variantRate: vRate, relativeLift: null, reasons, factors };
  }

  // Rule 3 — relative lift vs threshold. A flat baseline (0 conversions)
  // makes relative lift undefined: any conversions at all is an absolute
  // win; none at all is an absolute lose.
  const threshold = Number.isFinite(successThreshold) && successThreshold > 0 ? successThreshold : 0.1;
  const lift = bRate === 0 ? null : (vRate! - bRate!) / bRate!;
  factors.push({
    key: 'lift_vs_threshold',
    passed: true,
    detail: bRate === 0
      ? 'baseline rate is exactly 0 — absolute comparison applies instead of relative lift.'
      : 'relative lift ' + round4(lift!) + ' vs required ' + threshold + '.',
  });

  if (bRate === 0) {
    if (vRate! > 0) {
      reasons.push('Baseline converted nobody while the variant converted ' + variant.conversions + ' of ' + variant.visitors + ' — an absolute win; the hypothesis earned its keep.');
      return { verdict: 'win', baselineRate: bRate, variantRate: vRate, relativeLift: null, reasons, factors };
    }
    reasons.push('Neither arm converted anybody — nothing was learned about the hypothesis, only about the traffic.');
    return { verdict: 'inconclusive', baselineRate: bRate, variantRate: vRate, relativeLift: null, reasons, factors };
  }

  if (lift! >= threshold) {
    reasons.push('Variant rate ' + round4(vRate!) + ' beat baseline ' + round4(bRate!) + ' by ' + round4(lift!) + ' relative lift, clearing the required ' + threshold + ' — the hypothesis holds on this evidence.');
    return { verdict: 'win', baselineRate: bRate, variantRate: vRate, relativeLift: round4(lift!), reasons, factors };
  }
  if (lift! <= -threshold) {
    reasons.push('Variant rate ' + round4(vRate!) + ' fell below baseline ' + round4(bRate!) + ' by ' + round4(-lift!) + ' — the hypothesis is wrong in the measured direction; kill this direction, keep the learning.');
    return { verdict: 'lose', baselineRate: bRate, variantRate: vRate, relativeLift: round4(lift!), reasons, factors };
  }
  reasons.push('Lift ' + round4(lift!) + ' sits inside the ±' + threshold + ' indifference band — the market shrugged; iterate the offer instead of celebrating or mourning.');
  return { verdict: 'inconclusive', baselineRate: bRate, variantRate: vRate, relativeLift: round4(lift!), reasons, factors };
}
