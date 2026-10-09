// ============================================================================
// FILE: /apps/api/src/modules/insights/engine/weekly-report.ts
// ============================================================================
// Weekly AI business report (BizStack 20, riding the patterns/portfolio
// data Forge Nova already persists). Pure: no DB, no clock — the CALLER
// supplies the date and the snapshot; the engine assembles the brief.
//
// Value question: "what actually happened in my portfolio this week, and
// what are the three things to do next?" Dashboards show numbers; a REPORT
// turns them into a decision. The difference is structure: pulse, movers,
// pipeline, risks, actions — each honest about what the data can prove.
//
// Policy (every choice has a written reason):
//   - Every claim carries a number that came from the snapshot. No
//     invented momentum, no motivational filler.
//   - Sections degrade honestly: no revenue data says "no revenue data",
//     never "great week!".
//   - Actions are derived from verdicts and risks ALREADY computed by the
//     decision and portfolio engines — the report never invents advice
//     that contradicts them.
//
// Contract: deterministic; same snapshot + date = same report, always.

export interface ReportProduct {
  id: string;
  name: string;
  status: string;
  revenue: number;
  orders: number;
  verdict?: string | null;
}

export interface ReportOpportunity {
  id: string;
  title: string;
  category: string;
  score: number;
  status: string;
}

export interface ReportRisk {
  riskScore: number;
  verdict: string;
  warnings: string[];
}

export interface ReportSnapshot {
  date: string; // ISO date, supplied by the caller (purity).
  products: ReportProduct[];
  opportunities: ReportOpportunity[];
  risk: ReportRisk;
}

export interface WeeklyReport {
  headline: string;
  weekOf: string;
  pulse: string;
  movers: string[];
  pipeline: string[];
  risks: string[];
  actions: string[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildWeeklyReport(snap: ReportSnapshot): WeeklyReport {
  const products = (snap.products || []).filter(p => p && p.id);
  const opportunities = (snap.opportunities || []).filter(o => o && o.id);
  const risk = snap.risk || { riskScore: 0, verdict: 'empty', warnings: [] };

  const live = products.filter(p => p.status === 'live');
  const totalRevenue = products.reduce((a, p) => a + Math.max(0, num(p.revenue)), 0);
  const totalOrders = products.reduce((a, p) => a + Math.max(0, Math.floor(num(p.orders))), 0);

  // --- Pulse: the honest state of the portfolio -------------------------------
  const pulse =
    products.length === 0
      ? 'The portfolio is empty — nothing built yet. The only honest action is to pick one opportunity and ship the first draft.'
      : 'Portfolio: ' + products.length + ' product(s), ' + live.length + ' live, cumulative revenue ' + Math.round(totalRevenue) + ' across ' + totalOrders + ' order(s). ' +
        (totalRevenue > 0 ? 'Revenue exists — the portfolio is past theory.' : 'No revenue recorded yet — revenue, not launches, is the scoreboard.');

  // --- Movers: top products by revenue, ties broken by name ------------------
  const movers = [...products]
    .sort((a, b) => num(b.revenue) - num(a.revenue) || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map(p =>
      num(p.revenue) > 0
        ? p.name + ' — ' + Math.round(num(p.revenue)) + ' revenue over ' + Math.floor(num(p.orders)) + ' order(s), status ' + p.status + (p.verdict ? ', verdict ' + p.verdict : '') + '.'
        : p.name + ' — no recorded revenue yet, status ' + p.status + '.',
    );

  // --- Pipeline: top opportunities by score ------------------------------------
  const pipeline = [...opportunities]
    .sort((a, b) => num(b.score) - num(a.score) || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map(o => o.title + ' (' + o.category + ') — score ' + num(o.score) + ', status ' + o.status + '.');

  // --- Risks: passed through from the portfolio engine, capped -----------------
  const risks = (risk.warnings || []).slice(0, 5);

  // --- Actions: derived from verdicts + risk, in priority order ---------------
  const actions: string[] = [];
  const scaleCandidates = products.filter(p => p.verdict === 'SCALE');
  const killCandidates = products.filter(p => p.verdict === 'KILL');
  const pivotCandidates = products.filter(p => p.verdict === 'PIVOT');
  if (killCandidates.length) {
    actions.push('Retire or rework the KILL-verdict product(s): ' + killCandidates.map(p => p.name).join(', ') + '. Money follows evidence, not sentiment.');
  }
  if (scaleCandidates.length) {
    actions.push('Double down on the SCALE-verdict product(s): ' + scaleCandidates.map(p => p.name).join(', ') + '. Proven demand earns the next unit of effort.');
  }
  if (pivotCandidates.length) {
    actions.push('Run one cheap validation on the PIVOT-verdict product(s): ' + pivotCandidates.map(p => p.name).join(', ') + '. A pivot is a bet — keep it small.');
  }
  if (risk.riskScore >= 60) {
    actions.push('Portfolio risk is ' + risk.riskScore + '/100 (' + risk.verdict + ') — diversify before scaling anything.');
  }
  if (products.length > 0 && totalRevenue === 0) {
    actions.push('Get the first sale. Everything else this week is decoration until revenue exists.');
  }
  if (opportunities.length && !products.length) {
    actions.push('Pick the top-scored opportunity (' + (opportunities.sort((a, b) => num(b.score) - num(a.score))[0] || { title: 'the first one' }).title + ') and turn it into a draft this week.');
  }
  if (!actions.length) {
    actions.push('No verdicts, no risks, no revenue to interpret. The honest move: run a decision pass on the portfolio and a scan for fresh opportunities.');
  }

  const headline =
    'Week of ' + snap.date + ' — ' + products.length + ' product(s), ' + opportunities.length + ' opportunit(ies), portfolio risk ' + risk.riskScore + '/100.';

  return { headline, weekOf: snap.date, pulse, movers, pipeline, risks, actions };
}
