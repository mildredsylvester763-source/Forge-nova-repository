// ============================================================================
// FILE: /apps/api/src/modules/portfolio/engine/capital-allocation.ts
// ============================================================================
// Capital allocation optimizer (Feature 45). Pure: no DB, no clock, no
// network — the caller supplies the budget and the candidates (each already
// judged by the decision engine). Same discipline as every engine.
//
// Value question: "given this budget and these verdicts, where does the
// next unit of money do the most work — without ever betting the whole
// pot on one product?"
//
// Policy (every number has a written reason):
//   - KILL and HOLD get exactly 0, with the verdict quoted as the reason —
//     money follows evidence, never habit.
//   - SCALE candidates earn weight proportional to the decision engine's
//     confidence — proven winners get the most.
//   - PIVOT candidates earn 0.4× their confidence — a pivot is a validation
//     bet, not a commitment; cheap, capped, and revisited after evidence.
//   - No single candidate may absorb more than maxSharePerCandidate of the
//     budget (default 40%) — diversification is enforced structurally, not
//     hoped for. Overflow redistributes to uncapped candidates by weight;
//     whatever survives the caps becomes the reserve.
//
// Contract: deterministic; allocations + reserve sum to exactly the budget
// (pinned by spec); every allocation carries its reasons.

export interface AllocationCandidate {
  id: string;
  name: string;
  verdict: 'KILL' | 'SCALE' | 'PIVOT' | 'HOLD';
  // 0-100, from the decision engine's confidence.
  confidence: number;
}

export interface AllocationOptions {
  // Maximum share of the budget any single candidate may receive.
  maxSharePerCandidate?: number;
}

export interface Allocation {
  id: string;
  name: string;
  verdict: AllocationCandidate['verdict'];
  amount: number;
  share: number;
  reasons: string[];
}

export interface AllocationPlan {
  budget: number;
  allocated: number;
  reserve: number;
  allocations: Allocation[];
  warnings: string[];
}

const PIVOT_WEIGHT_FACTOR = 0.4; // A pivot is a validation bet, not a commitment.
const DEFAULT_MAX_SHARE = 0.4;   // No single product may absorb more than 40%.
const MAX_ITERATIONS = 50;       // Redistribution converges in <= candidate count passes.

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function weightOf(candidate: AllocationCandidate): number {
  const confidence = Math.min(100, Math.max(0, Number(candidate.confidence) || 0)) / 100;
  if (candidate.verdict === 'SCALE') return confidence;
  if (candidate.verdict === 'PIVOT') return confidence * PIVOT_WEIGHT_FACTOR;
  return 0; // KILL and HOLD: money follows evidence, never habit.
}

export function allocateCapital(
  budget: number,
  candidates: AllocationCandidate[],
  options: AllocationOptions = {},
): AllocationPlan {
  const warnings: string[] = [];
  const maxShare = Math.min(1, Math.max(0.01, options.maxSharePerCandidate ?? DEFAULT_MAX_SHARE));
  const safeBudget = Math.max(0, Number(budget) || 0);

  const reasonsById = new Map<string, string[]>();
  for (const c of candidates) {
    const reasons: string[] = [];
    if (c.verdict === 'KILL') reasons.push('Verdict KILL — the market already voted; no capital follows.');
    if (c.verdict === 'HOLD') reasons.push('Verdict HOLD — no rule fired; capital follows evidence, not habit.');
    if (c.verdict === 'SCALE') reasons.push('Verdict SCALE at ' + c.confidence + ' confidence — proven demand earns proportional weight.');
    if (c.verdict === 'PIVOT') reasons.push('Verdict PIVOT at ' + c.confidence + ' confidence — a validation bet at 40% weight, capped and revisited.');
    reasonsById.set(c.id, reasons);
  }

  const eligible = candidates.filter(c => weightOf(c) > 0);
  if (safeBudget <= 0 || !eligible.length) {
    if (safeBudget <= 0) warnings.push('Budget is zero — nothing to allocate.');
    if (safeBudget > 0 && !eligible.length) {
      warnings.push('No SCALE or PIVOT candidates — the entire budget is held in reserve rather than spread on unproven verdicts.');
    }
    return {
      budget: safeBudget,
      allocated: 0,
      reserve: round2(safeBudget),
      allocations: candidates.map(c => ({
        id: c.id, name: c.name, verdict: c.verdict, amount: 0, share: 0,
        reasons: reasonsById.get(c.id) || [],
      })),
      warnings,
    };
  }

  // Weighted allocation with caps and iterative redistribution: overflow from
  // capped candidates reflows to uncapped ones by weight, until stable.
  const cap = safeBudget * maxShare;
  const weights = new Map(eligible.map(c => [c.id, weightOf(c)]));
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  let remaining = safeBudget;
  const raw = new Map<string, number>();
  for (const c of eligible) {
    const amount = (safeBudget * (weights.get(c.id) || 0)) / totalWeight;
    raw.set(c.id, amount);
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const uncappedIds: string[] = [];
    let uncappedRawTotal = 0;
    for (const c of eligible) {
      const amount = raw.get(c.id) || 0;
      if (amount >= cap - 1e-9) {
        raw.set(c.id, cap);
        remaining -= cap;
      } else {
        uncappedIds.push(c.id);
        uncappedRawTotal += amount;
      }
    }
    if (!uncappedIds.length || remaining <= 1e-9) break;
    // Redistribute what is left among the uncapped, proportionally to their
    // current raw amounts (which already encode the weights).
    const uncappedCurrentTotal = uncappedIds.reduce((a, id) => a + (raw.get(id) || 0), 0);
    const scale = (uncappedCurrentTotal + remaining) / (uncappedCurrentTotal || 1);
    for (const id of uncappedIds) {
      raw.set(id, (raw.get(id) || 0) * scale);
    }
    remaining = safeBudget - [...raw.values()].reduce((a, b) => a + b, 0);
    // Detect a stable state: nobody exceeds the cap anymore.
    if ([...raw.values()].every(v => v <= cap + 1e-9)) break;
  }

  // Final pass: enforce the cap once more, round, and collect the reserve.
  let allocatedTotal = 0;
  const finalAmounts = new Map<string, number>();
  for (const c of eligible) {
    const amount = Math.min(cap, Math.max(0, raw.get(c.id) || 0));
    const rounded = round2(amount);
    finalAmounts.set(c.id, rounded);
    allocatedTotal += rounded;
  }
  const reserve = round2(Math.max(0, safeBudget - allocatedTotal));
  if (reserve > 0) {
    warnings.push('Reserve of ' + reserve + ' held back — caps prevented concentrating the budget further.');
  }

  return {
    budget: round2(safeBudget),
    allocated: round2(allocatedTotal),
    reserve,
    allocations: candidates.map(c => {
      const amount = finalAmounts.get(c.id) ?? 0;
      const reasons = reasonsById.get(c.id) || [];
      if (amount > 0 && amount >= cap - 0.005) {
        reasons.push('Capped at the ' + Math.round(maxShare * 100) + '% single-candidate ceiling — diversification is enforced structurally.');
      }
      return {
        id: c.id, name: c.name, verdict: c.verdict,
        amount,
        share: safeBudget > 0 ? round2((amount / safeBudget) * 100) : 0,
        reasons,
      };
    }),
    warnings,
  };
}
