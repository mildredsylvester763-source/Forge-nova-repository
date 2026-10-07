// ============================================================================
// FILE: /apps/api/src/modules/products/decision/decision.config.ts
// ============================================================================
// The single tuning surface for the kill/scale/pivot decision engine.
// Every threshold has a written reason — no magic numbers, ever. A verdict
// must be explainable to the owner in one sentence: what fired, why now.

export const DECISION_MIN_OBSERVATION_DAYS = 30;
// Thirty days is the smallest window in which revenue is not launch-noise:
// one good week proves nothing, four do not lie.

export const DECISION_KILL_REVENUE_FLOOR = 100;
// A live product that cannot clear this in a full observation window has
// failed its market test. Killing it is the cheapest decision available.

export const DECISION_SCALE_REVENUE_THRESHOLD = 1000;
export const DECISION_SCALE_MIN_ORDERS = 20;
// Scaling needs BOTH money and repeat proof: 20+ orders means demand is
// broad, not one lucky whale.

export const DECISION_PIVOT_MIN_REVENUE = 250;
export const DECISION_PIVOT_MAX_ORDERS = 10;
// Money arrives but rarely, and rarely enough: the offer shape is wrong,
// not the work. Pivot changes the offer; killing would waste real demand.

// Only statuses with live market data can be decided. Drafts and pre-launch
// products have no evidence — the engine refuses to guess (HOLD, not lies).
export const DECIDABLE_STATUSES = ['live', 'paused'] as const;

export type Verdict = 'KILL' | 'SCALE' | 'PIVOT' | 'HOLD';

// Portfolio ordering: actionables first. A SCALE and a KILL both demand
// the owner's attention today; a HOLD never outranks either.
export const VERDICT_PRIORITY: Record<Verdict, number> = {
  SCALE: 0,
  KILL: 1,
  PIVOT: 2,
  HOLD: 3,
};

export const VERDICT_ACTIONS: Record<Verdict, string> = {
  SCALE: 'Double down: raise ad spend, expand the channel mix, deepen stock or capacity.',
  KILL: 'Retire it: stop all spend, archive assets, write the post-mortem into the pattern library.',
  PIVOT: 'Change the offer, not the work: repackage, reprice, or re-audience before killing.',
  HOLD: 'No action: re-evaluate after the next observation window or scan.',
};