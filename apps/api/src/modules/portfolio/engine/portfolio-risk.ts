// ============================================================================
// FILE: /apps/api/src/modules/portfolio/engine/portfolio-risk.ts
// ============================================================================
// Portfolio risk & correlation analysis (Feature 44). Pure: no DB, no clock,
// no network — the caller gathers the user's products and opportunities and
// maps them into plain inputs. Same discipline as every engine.
//
// Value question: "if one thing breaks, how much of my income breaks with
// it?" Concentration is the silent killer of micro-business portfolios:
// one product carrying 90% of revenue, one category dominating, or the
// pipeline doubling down on a category the portfolio is already overweight
// in. The engine names each concentration in plain words.
//
// Correlation proxy: when the user's top opportunities keep landing in the
// same categories as their live products, the PIPELINE is correlated with
// the PORTFOLIO — the next bet amplifies the existing risk instead of
// diversifying it. (True revenue correlation needs time-series revenue
// data that does not exist yet; category overlap is the honest proxy.)
//
// Contract: deterministic, bounded [0, 100], every contribution explained
// in factors, an empty portfolio reported as empty (risk 0 + warning),
// never as "perfectly diversified".

export interface RiskProduct {
  id: string;
  category: string;
  status: string;
  revenue: number;
}

export interface RiskOpportunity {
  id: string;
  category: string;
  score: number;
}

export interface RiskFactor {
  key: string;
  // The factor's contribution to the final risk score, 0-100 scale before weighting.
  rawScore: number;
  weight: number;
  detail: string;
}

export interface PortfolioRiskResult {
  // 0-100. Higher = more concentrated, more correlated, more fragile.
  riskScore: number;
  verdict: 'concentrated' | 'balanced' | 'diversified' | 'empty';
  productCount: number;
  liveCount: number;
  distinctCategories: number;
  // HHI over product revenue shares, 0-10000 (antitrust scale).
  revenueHHI: number;
  // Share of total revenue held by the single biggest product, 0-100.
  topProductShare: number;
  // % of the top pursuit opportunities whose category matches a live product.
  pursuitOverlap: number;
  warnings: string[];
  factors: RiskFactor[];
}

// Weights have written reasons and sum to exactly 1 (pinned by spec).
const W_REVENUE_HHI = 0.35;    // Product-level revenue concentration — the core fragility.
const W_TOP_SHARE = 0.25;      // The single-point-of-failure measure.
const W_BREADTH = 0.25;        // How many live products share the load.
const W_PURSUIT_OVERLAP = 0.15; // Pipeline/portfolio correlation — the compounding risk.

const OVERLAP_SAMPLE_SIZE = 5; // Top-N opportunities examined for correlation.

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function hHI(shares: number[]): number {
  return Math.round(shares.reduce((a, s) => a + s * s, 0) * 10000);
}

export function assessPortfolioRisk(products: RiskProduct[], opportunities: RiskOpportunity[]): PortfolioRiskResult {
  const warnings: string[] = [];
  const factors: RiskFactor[] = [];

  if (!products.length) {
    return {
      riskScore: 0,
      verdict: 'empty',
      productCount: 0,
      liveCount: 0,
      distinctCategories: 0,
      revenueHHI: 0,
      topProductShare: 0,
      pursuitOverlap: 0,
      warnings: ['Portfolio is empty — there is nothing to analyze yet.'],
      factors: [],
    };
  }

  const revenues = products.map(p => Math.max(0, Number(p.revenue) || 0));
  const totalRevenue = revenues.reduce((a, b) => a + b, 0);

  // Factor 1 — revenue concentration across products (HHI on product shares).
  const revenueShares = totalRevenue > 0 ? revenues.map(r => r / totalRevenue) : products.map(() => 1 / products.length);
  const revenueHHI = hHI(revenueShares);
  const hhiScore = Math.min(100, revenueHHI / 100); // 10000 → 100.
  factors.push({
    key: 'revenue_hhi',
    rawScore: round2(hhiScore),
    weight: W_REVENUE_HHI,
    detail: 'Revenue HHI ' + revenueHHI + ' across ' + products.length + ' products (10000 = all revenue in one product).',
  });

  // Factor 2 — the single point of failure.
  const topProductShare = totalRevenue > 0 ? Math.max(...revenues) / totalRevenue : 1 / products.length;
  const topShareScore = topProductShare * 100;
  factors.push({
    key: 'top_product_share',
    rawScore: round2(topShareScore),
    weight: W_TOP_SHARE,
    detail: 'The biggest product holds ' + round2(topProductShare * 100) + '% of revenue.',
  });
  if (topProductShare > 0.5 && products.length > 1) {
    warnings.push('One product carries more than half of total revenue — losing it breaks the portfolio.');
  }

  // Factor 3 — breadth. One live product is maximum fragility; each addition
  // genuinely spreads the load (diminishing: the 6th+ adds nothing here).
  const liveCount = products.filter(p => p.status === 'live' || p.status === 'paused').length;
  const breadthScore = liveCount <= 1 ? 100 : Math.max(0, 100 - (liveCount - 1) * 20);
  factors.push({
    key: 'breadth',
    rawScore: breadthScore,
    weight: W_BREADTH,
    detail: liveCount + ' product(s) with live market data.',
  });
  if (liveCount <= 1) {
    warnings.push('Only ' + liveCount + ' live product — a single point of failure by definition.');
  }

  // Factor 4 — pipeline/portfolio correlation proxy: category overlap between
  // the top pursuit opportunities and the live portfolio's categories.
  const liveCategories = new Set(
    products.filter(p => p.status === 'live' || p.status === 'paused').map(p => String(p.category || '').toLowerCase()),
  );
  const topPursuits = [...opportunities]
    .filter(o => o && o.category)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, OVERLAP_SAMPLE_SIZE);
  const overlapCount = topPursuits.filter(o => liveCategories.has(String(o.category).toLowerCase())).length;
  const pursuitOverlap = topPursuits.length ? (overlapCount / topPursuits.length) * 100 : 0;
  factors.push({
    key: 'pursuit_overlap',
    rawScore: round2(pursuitOverlap),
    weight: W_PURSUIT_OVERLAP,
    detail: topPursuits.length
      ? overlapCount + ' of the top ' + topPursuits.length + ' opportunities sit in categories the portfolio is already live in.'
      : 'No scored opportunities to correlate against the pipeline yet.',
  });
  if (pursuitOverlap >= 60 && topPursuits.length >= 3) {
    warnings.push('The pipeline keeps targeting categories the portfolio is already concentrated in — the next bet amplifies existing risk instead of spreading it.');
  }

  const riskScore = round2(
    Math.min(100, Math.max(0,
      hhiScore * W_REVENUE_HHI +
      topShareScore * W_TOP_SHARE +
      breadthScore * W_BREADTH +
      pursuitOverlap * W_PURSUIT_OVERLAP,
    )),
  );

  const distinctCategories = new Set(products.map(p => String(p.category || '').toLowerCase())).size;
  const verdict = riskScore >= 60 ? 'concentrated' : riskScore >= 35 ? 'balanced' : 'diversified';
  if (verdict === 'concentrated') {
    warnings.push('Portfolio risk ' + riskScore + '/100 — concentrated; diversify before scaling anything.');
  }

  return {
    riskScore,
    verdict,
    productCount: products.length,
    liveCount,
    distinctCategories,
    revenueHHI,
    topProductShare: round2(topProductShare * 100),
    pursuitOverlap: round2(pursuitOverlap),
    warnings,
    factors,
  };
}
