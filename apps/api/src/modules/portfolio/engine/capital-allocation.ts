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

  // Weighted allocation under a structural cap: distribute the pool across
  // eligible candidates by weight; anyone whose share exceeds the cap is
  // fixed at the cap and the freed budget reflows to the rest, until nobody
  // exceeds it. Whatever is left when no candidates remain unfixed is the
  // reserve — never an over-allocation. (The first version of this
  // reflow double-counted capped overflow and could exceed the budget; the
  // seeded spec sweep caught it.)
  const cap = safeBudget * maxShare;
  const weights = new Map(eligible.map(c => [c.id, weightOf(c)]));
  const amounts = new Map<string, number>();
  const fixedAtCap = new Map<string, number>();
  let unfixed = eligible.slice();
  let pool = safeBudget;
  while (unfixed.length) {
    const unfixedWeight = unfixed.reduce((a, c) => a + (weights.get(c.id) || 0), 0);
    const overCap = unfixed.filter(c => (pool * (weights.get(c.id) || 0)) / unfixedWeight > cap + 1e-9);
    if (!overCap.length) {
      for (const c of unfixed) {
        amounts.set(c.id, (pool * (weights.get(c.id) || 0)) / unfixedWeight);
      }
      break;
    }
    for (const c of overCap) {
      fixedAtCap.set(c.id, cap);
      pool -= cap;
    }
    unfixed = unfixed.filter(c => !fixedAtCap.has(c.id));
  }
  for (const [id, amount] of fixedAtCap) amounts.set(id, amount);

  // Final pass: enforce the cap once more, round, and collect the reserve.
  let allocatedTotal = 0;
  const finalAmounts = new Map<string, number>();
  for (const c of eligible) {
    const amount = Math.min(cap, Math.max(0, amounts.get(c.id) || 0));
    const rounded = round2(amount);
    finalAmounts.set(c.id, rounded);
    allocatedTotal += rounded;
  }
  // Rounding each amount to cents can nudge the total a hair over the
  // budget (six amounts — half a cent). The contract says allocations plus
  // reserve always equal the budget, so any excess comes off the largest
  // allocation — deterministically, ties broken by id.
  if (allocatedTotal > safeBudget + 1e-9) {
    let excess = round2(allocatedTotal - safeBudget);
    const bySize = [...eligible].sort(
      (a, b) => (finalAmounts.get(b.id) || 0) - (finalAmounts.get(a.id) || 0) || (a.id < b.id ? -1 : 1),
    );
    for (const c of bySize) {
      if (excess <= 0) break;
      const trim = Math.min(excess, finalAmounts.get(c.id) || 0);
      finalAmounts.set(c.id, round2((finalAmounts.get(c.id) || 0) - trim));
      excess = round2(excess - trim);
    }
    allocatedTotal = [...finalAmounts.values()].reduce((a, b) => a + b, 0);
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
