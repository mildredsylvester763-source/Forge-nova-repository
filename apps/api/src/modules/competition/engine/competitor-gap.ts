// ============================================================================
// FILE: /apps/api/src/modules/competition/engine/competitor-gap.ts
// ============================================================================
// Competitor gap analysis (Feature 4, absorbs BizStack 29 "AI competitor
// scan report"). Pure: no DB, no clock, no network. The caller maps the
// opportunity's stored competitor snapshots and the user's product profile
// into plain inputs; the engine names where the market is crowded, where it
// is open, and what to do about it.
//
// Value question: "everyone can see the competitors. What nobody shows me
// is the GAP: what they all have that I don't, what I have that none of
// them do, and whether the price band leaves room."
//
// Policy (every number has a written reason):
//   - Crowd verdict comes from COMPETITOR COUNT, not vibes: 0-2 wide open,
//     3-7 contested, 8+ saturated. Cheap to compute, impossible to game.
//   - A feature gap only counts when at least HALF the measurable
//     competitors offer it (the majority defines the table stakes).
//   - An advantage only counts when NO competitor has it.
//   - Price position is a rank against the sorted band, never an average
//     (one luxury outlier must not fake "you are cheap").
//
// Contract: deterministic; competitors with unreadable/absent prices or
// features are counted for crowd size but excluded from the metric they
// would corrupt; every output carries its reasons.

export interface CompetitorInput {
  name: string;
  price?: number | null;
  rating?: number | null; // 0-5 scale.
  reviewCount?: number | null;
  features?: string[];
  shippingDays?: number | null;
}

export interface MyProfile {
  name?: string | null;
  price?: number | null;
  features?: string[];
  shippingDays?: number | null;
}

export interface FeatureGap {
  feature: string;
  offeredByCount: number;
  offeredBy: string[];
}

export interface GapReport {
  competitorCount: number;
  verdict: 'wide_open' | 'contested' | 'saturated';
  saturationScore: number; // 0-100
  priceBand: { min: number; median: number; max: number } | null;
  pricePositionPercentile: number | null; // 0 = cheapest, 100 = priciest.
  pricePositionNote: string | null;
  featureGaps: FeatureGap[];
  advantages: string[];
  moves: string[];
  warnings: string[];
}

const HALF = 0.5; // The majority defines the table stakes.
const CHEAP_EDGE = 0.9; // >10% below the median is a real price edge.
const PREMIUM_LINE = 1.1; // >10% above the median is a real premium position.

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeCompetitorGap(me: MyProfile, competitors: CompetitorInput[]): GapReport {
  const clean = (competitors || []).filter(c => c && (c.name || c.price != null || (c.features || []).length));
  const warnings: string[] = [];
  const moves: string[] = [];

  // --- Crowd verdict: count first, everything else second ---------------------
  const count = clean.length;
  const verdict = count <= 2 ? 'wide_open' : count <= 7 ? 'contested' : 'saturated';
  const saturationScore = Math.min(100, count * 10 + (count > 7 ? 20 : 0));
  if (count === 0) {
    warnings.push('No readable competitor snapshots — treat as uncharted water, not as proof of no competition.');
  }

  // --- Price band and position ------------------------------------------------
  const prices = clean.map(c => num(c.price)).filter((p): p is number => p != null);
  const priceBand = prices.length
    ? { min: Math.min(...prices), median: median([...prices].sort((a, b) => a - b)), max: Math.max(...prices) }
    : null;
  const myPrice = num(me.price);
  let pricePositionPercentile: number | null = null;
  let pricePositionNote: string | null = null;
  if (priceBand && myPrice != null) {
    const below = prices.filter(p => p < myPrice).length;
    pricePositionPercentile = prices.length ? Math.round((below / prices.length) * 100) : null;
    const ratio = myPrice / priceBand.median;
    if (ratio <= CHEAP_EDGE) {
      pricePositionNote = 'Priced ' + Math.round((1 - ratio) * 100) + '% below the band median — the undercut is a real edge only if the quality story holds.';
      moves.push('You are the value option. Say so loudly instead of racing further down.');
    } else if (ratio >= PREMIUM_LINE) {
      pricePositionNote = 'Priced ' + Math.round((ratio - 1) * 100) + '% above the band median — a premium position must be earned with advantages, not assumed.';
      moves.push('Your premium only survives if the advantages below are real. Audit them.');
    } else {
      pricePositionNote = 'Priced inside the band (median ' + priceBand.median + ') — price is not the differentiator here; the gaps are.';
    }
  } else if (priceBand == null && count > 0) {
    warnings.push('No competitor prices were readable — the price band is unknown, not zero.');
  }

  // --- Feature gaps: the majority sets the table stakes -----------------------
  const withFeatures = clean.filter(c => Array.isArray(c.features) && c.features.length);
  const meFeatures = new Set((me.features || []).map(norm));
  const tally = new Map<string, string[]>();
  for (const c of withFeatures) {
    const seen = new Set<string>();
    for (const f of c.features || []) {
      const key = norm(f);
      if (key && !seen.has(key)) {
        seen.add(key);
        const list = tally.get(key) || [];
        list.push(c.name || 'unnamed competitor');
        tally.set(key, list);
      }
    }
  }
  const featureGaps: FeatureGap[] = [];
  const advantages: string[] = [];
  const threshold = Math.max(1, Math.ceil(withFeatures.length * HALF));
  for (const [feature, offeredBy] of tally) {
    if (offeredBy.length >= threshold && !meFeatures.has(feature)) {
      featureGaps.push({ feature, offeredByCount: offeredBy.length, offeredBy });
    }
  }
  featureGaps.sort((a, b) => b.offeredByCount - a.offeredByCount || a.feature.localeCompare(b.feature));
  for (const gap of featureGaps.slice(0, 5)) {
    moves.push('Close the gap on "' + gap.feature + '" — ' + gap.offeredByCount + ' of ' + withFeatures.length + ' measured competitors already offer it. It is table stakes, not a bonus.');
  }
  for (const f of meFeatures) {
    if (f && ![...tally.keys()].some(k => k === f)) {
      advantages.push('"' + f + '" is offered by none of the measured competitors — a real differentiator. Lead with it.');
    }
  }

  // --- Verdict-shaped moves ---------------------------------------------------
  if (verdict === 'wide_open') {
    moves.push('Only ' + count + ' competitor(s) visible — move fast and stake the niche before the crowd finds it.');
  } else if (verdict === 'contested') {
    moves.push('The niche is contested (' + count + ' competitors) — win on a gap, not on presence.');
  } else {
    moves.push('The niche is saturated (' + count + ' competitors) — only enter with a structural advantage; otherwise pick a different fight.');
  }

  return {
    competitorCount: count,
    verdict,
    saturationScore,
    priceBand,
    pricePositionPercentile,
    pricePositionNote,
    featureGaps,
    advantages,
    moves,
    warnings,
  };
}

// ============================================================================
// BZ 29: the competitor SCAN REPORT — a structured, human-readable brief
// built from the same analysis. Sections are plain strings so any surface
// (email, PDF, WhatsApp) can render them without a template engine.
// ============================================================================
export interface ScanReport {
  headline: string;
  market: string;
  gaps: string;
  edge: string;
  bottomLine: string;
}

export function buildScanReport(me: MyProfile, competitors: CompetitorInput[]): ScanReport {
  const r = analyzeCompetitorGap(me, competitors);
  const subject = me.name || 'Your offer';
  const headline =
    subject + ' vs ' + r.competitorCount + ' competitor(s) — verdict: ' + r.verdict.replace('_', ' ') + '.';
  const market = r.priceBand
    ? 'Prices run ' + r.priceBand.min + ' to ' + r.priceBand.max + ' with a median of ' + r.priceBand.median + '. ' + (r.pricePositionNote || '')
    : 'No readable competitor prices — the band is unknown.';
  const gaps = r.featureGaps.length
    ? 'Table stakes you are missing: ' + r.featureGaps.map(g => '"' + g.feature + '" (' + g.offeredByCount + '/' + r.competitorCount + ')').join(', ') + '.'
    : 'No majority feature gaps — you cover the table stakes.';
  const edge = r.advantages.length
    ? 'Yours alone: ' + r.advantages.slice(0, 3).join(' ')
    : 'Nothing measured is uniquely yours yet — that is the first thing to fix.';
  const bottomLine = r.moves[0] || 'Not enough signal to advise. Scan again with more detail.';
  return { headline, market, gaps, edge, bottomLine };
}
