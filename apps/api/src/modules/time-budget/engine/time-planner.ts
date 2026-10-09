// ============================================================================
// FILE: /apps/api/src/modules/time-budget/engine/time-planner.ts
// ============================================================================
// Personal time-budget guardrails (Feature 46). Pure: no DB, no clock, no
// network — the caller supplies capacity and requests. Same discipline as
// every engine.
//
// Value question: "I have 20 hours this week and four businesses asking for
// 40 — what is the honest plan, and what exactly breaks?"
// Baseline beaten: first-come-first-served (whoever shouted loudest got
// the hours; proven in spec: a critical request arriving last still wins
// its hours before a low-priority early arrival).
//
// Policy (every number has a written reason):
//   - Capacity fits everything → grant all, report the leftover honestly.
//   - Overcommitted → grant proportionally to PRIORITY WEIGHTS, never
//     arrival order: critical 4, high 3, normal 2, low 1.
//   - No request is granted more than it asked for — surplus reflows to
//     still-deficient requests by weight until the capacity is exhausted.
//   - Every deficit is named in the warnings — the owner sees exactly
//     which commitment breaks, by how much.
//
// Contract: deterministic; grants never exceed capacity (1e-9 slack for
// float arithmetic); every request appears in the output exactly once.

export type TimePriority = 'critical' | 'high' | 'normal' | 'low';

export interface TimeRequest {
  ref: string;
  label: string;
  requestedHours: number;
  priority: TimePriority;
}

export interface PlannedAllocation {
  ref: string;
  label: string;
  requestedHours: number;
  grantedHours: number;
  priority: TimePriority;
  deficit: number;
}

export interface TimePlan {
  capacityHours: number;
  totalRequested: number;
  totalGranted: number;
  leftoverHours: number;
  overcommitted: boolean;
  allocations: PlannedAllocation[];
  warnings: string[];
}

export const PRIORITY_WEIGHTS: Record<TimePriority, number> = {
  critical: 4, // Breaks the business this week if skipped.
  high: 3,     // Real cost if delayed, survivable if trimmed.
  normal: 2,   // Meaningful, but flexible.
  low: 1,      // Nice to have; the first to give ground.
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function planTime(
  capacityHours: number,
  requests: TimeRequest[],
): TimePlan {
  const warnings: string[] = [];
  const capacity = Math.max(0, Number(capacityHours) || 0);
  const valid = requests.filter(r => r && r.ref && Number(r.requestedHours) > 0);
  if (requests.length !== valid.length) {
    warnings.push(requests.length - valid.length + ' invalid request(s) ignored — a request needs a ref and positive hours.');
  }
  if (!valid.length) {
    return {
      capacityHours: capacity, totalRequested: 0, totalGranted: 0,
      leftoverHours: round2(capacity), overcommitted: false, allocations: [], warnings,
    };
  }

  // Deduplicate by ref: the same business asking twice is a data error —
  // the LAST ask wins, and the collision is surfaced, never merged silently.
  const byRef = new Map<string, TimeRequest>();
  for (const r of valid) {
    if (byRef.has(r.ref)) warnings.push('Duplicate ref ' + r.ref + ' — the later request replaced the earlier one.');
    byRef.set(r.ref, r);
  }
  const unique = [...byRef.values()];

  const totalRequested = round2(unique.reduce((a, r) => a + Math.max(0, Number(r.requestedHours) || 0), 0));
  const fits = totalRequested <= capacity + 1e-9;

  const granted = new Map<string, number>();
  if (fits) {
    for (const r of unique) granted.set(r.ref, round2(Math.max(0, Number(r.requestedHours) || 0)));
  } else {
    // Overcommitted: proportional-to-weight grants, floored at each
    // request's own ask, with iterative reflow of the surplus.
    let remaining = capacity;
    const weights = new Map(unique.map(r => [r.ref, PRIORITY_WEIGHTS[r.priority] ?? PRIORITY_WEIGHTS.normal]));
    const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
    for (const r of unique) {
      const ask = Math.max(0, Number(r.requestedHours) || 0);
      const share = (capacity * (weights.get(r.ref) || 0)) / totalWeight;
      const g = Math.min(ask, share);
      granted.set(r.ref, g);
      remaining -= g;
    }
    // Reflow: distribute what is left to requests still below their ask,
    // proportionally to their weights, until nothing is left or everyone
    // is satisfied. Iteration converges: each pass either fills a request
    // or exhausts the remainder.
    for (let pass = 0; pass <= unique.length && remaining > 1e-9; pass++) {
      const deficient = unique.filter(r => (granted.get(r.ref) || 0) < Math.max(0, Number(r.requestedHours) || 0) - 1e-9);
      if (!deficient.length) break;
      const deficientWeight = deficient.reduce((a, r) => a + (weights.get(r.ref) || 0), 0);
      if (deficientWeight <= 0) break;
      for (const r of deficient) {
        const ask = Math.max(0, Number(r.requestedHours) || 0);
        const current = granted.get(r.ref) || 0;
        const add = (remaining * (weights.get(r.ref) || 0)) / deficientWeight;
        const g = Math.min(ask, current + add);
        granted.set(r.ref, g);
        remaining -= g - current;
      }
    }
  }

  const allocations: PlannedAllocation[] = unique.map(r => {
    const ask = round2(Math.max(0, Number(r.requestedHours) || 0));
    const got = round2(Math.max(0, granted.get(r.ref) || 0));
    return {
      ref: r.ref,
      label: r.label,
      requestedHours: ask,
      grantedHours: got,
      priority: r.priority,
      deficit: round2(Math.max(0, ask - got)),
    };
  });

  // Rounding each grant to cents can nudge the total a hair over capacity
  // (six grants — half a cent). The contract says grants NEVER exceed
  // capacity, so any excess comes off the largest grant — deterministically,
  // ties broken by ref.
  let grantedSum = allocations.reduce((a, x) => a + x.grantedHours, 0);
  if (grantedSum > capacity + 1e-9) {
    let excess = round2(grantedSum - capacity);
    const bySize = [...allocations].sort(
      (a, b) => b.grantedHours - a.grantedHours || (a.ref < b.ref ? -1 : 1),
    );
    for (const a of bySize) {
      if (excess <= 0) break;
      const trim = Math.min(excess, a.grantedHours);
      a.grantedHours = round2(a.grantedHours - trim);
      a.deficit = round2(Math.max(0, a.requestedHours - a.grantedHours));
      excess = round2(excess - trim);
    }
    grantedSum = allocations.reduce((a, x) => a + x.grantedHours, 0);
  }
  const totalGranted = round2(grantedSum);
  const leftoverHours = round2(Math.max(0, capacity - totalGranted));
  if (!fits) {
    warnings.push('Overcommitted by ' + round2(totalRequested - capacity) + ' hours — the plan below is what capacity honestly allows.');
    for (const a of allocations) {
      if (a.deficit > 0) {
        warnings.push(a.label + ' (' + a.ref + ') loses ' + a.deficit + 'h — ' + a.priority + ' priority gave ground.');
      }
    }
  }

  return {
    capacityHours: round2(capacity),
    totalRequested,
    totalGranted,
    leftoverHours,
    overcommitted: !fits,
    allocations,
    warnings,
  };
}
