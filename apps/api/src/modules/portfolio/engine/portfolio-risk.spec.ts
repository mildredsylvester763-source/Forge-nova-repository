import { assessPortfolioRisk, RiskProduct, RiskOpportunity } from './portfolio-risk';

const P = (over: Partial<RiskProduct>): RiskProduct => ({
  id: 'p', category: 'software_tools', status: 'live', revenue: 0, ...over,
});
const O = (over: Partial<RiskOpportunity>): RiskOpportunity => ({
  id: 'o', category: 'consulting', score: 50, ...over,
});

describe('assessPortfolioRisk pinned vectors', () => {
  it('reports an empty portfolio as empty — never "perfectly diversified"', () => {
    const r = assessPortfolioRisk([], []);
    expect(r.verdict).toBe('empty');
    expect(r.riskScore).toBe(0);
    expect(r.warnings[0]).toContain('empty');
  });

  it('a single live product is maximum concentration (100)', () => {
    const r = assessPortfolioRisk([P({ revenue: 500 })], []);
    expect(r.riskScore).toBe(100);
    expect(r.verdict).toBe('concentrated');
    expect(r.topProductShare).toBe(100);
  });

  it('five equal-revenue, different-category products score low and diversify', () => {
    const products = ['a', 'b', 'c', 'd', 'e'].map((c, i) => P({ id: 'p' + i, category: c, revenue: 1000 }));
    const r = assessPortfolioRisk(products, []);
    expect(r.riskScore).toBeLessThan(35);
    expect(r.verdict).toBe('diversified');
    expect(r.revenueHHI).toBe(2000); // 5 × (0.2)² = 0.2 → 2000.
  });

  it('weights sum to exactly 1 — a neutral board scores its own math', () => {
    const r = assessPortfolioRisk([P({ revenue: 100 })], []);
    const weightSum = r.factors.reduce((a, f) => a + f.weight, 0);
    expect(weightSum).toBe(1);
  });

  it('pipeline correlation pushes the score up and warns at 60%+ overlap', () => {
    const products = ['a', 'b', 'c', 'd', 'e'].map((c, i) => P({ id: 'p' + i, category: c, revenue: 1000 }));
    const correlated = ['a', 'a', 'a', 'b', 'x'].map((c, i) => O({ id: 'o' + i, category: c, score: 90 - i }));
    const scattered = ['x', 'y', 'z', 'w', 'v'].map((c, i) => O({ id: 'o' + i, category: c, score: 90 - i }));
    const withCorrelation = assessPortfolioRisk(products, correlated);
    const without = assessPortfolioRisk(products, scattered);
    expect(withCorrelation.pursuitOverlap).toBe(80);
    expect(withCorrelation.riskScore).toBeGreaterThan(without.riskScore);
    expect(withCorrelation.warnings.some(w => w.includes('pipeline'))).toBe(true);
  });

  it('zero-revenue products degrade to equal shares, never NaN', () => {
    const r = assessPortfolioRisk([P({ id: 'a', revenue: 0 }), P({ id: 'b', revenue: 0 })], []);
    expect(Number.isFinite(r.riskScore)).toBe(true);
    expect(r.topProductShare).toBe(50);
  });
});

describe('assessPortfolioRisk invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(444444);
  const cats = ['a', 'b', 'c'];
  const statuses = ['live', 'paused', 'draft', 'retired'];

  it('stays bounded [0,100], finite, and consistent across 500 seeded portfolios', () => {
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 5);
      const products: RiskProduct[] = Array.from({ length: n }, (_, j) => P({
        id: 'p' + j,
        category: cats[Math.floor(rand() * cats.length)],
        status: statuses[Math.floor(rand() * statuses.length)],
        revenue: Math.floor(rand() * 5000),
      }));
      const opportunities: RiskOpportunity[] = Array.from({ length: 3 }, (_, j) => O({
        id: 'o' + j,
        category: cats[Math.floor(rand() * cats.length)],
        score: Math.floor(rand() * 100),
      }));
      const r = assessPortfolioRisk(products, opportunities);
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
      expect(r.riskScore).toBeLessThanOrEqual(100);
      expect(Number.isFinite(r.riskScore)).toBe(true);
      if (r.factors.length) {
        const weightSum = r.factors.reduce((a, f) => a + f.weight, 0);
        expect(Math.abs(weightSum - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('is deterministic', () => {
    const products = [P({ id: 'a', revenue: 100 }), P({ id: 'b', revenue: 300 })];
    expect(assessPortfolioRisk(products, [])).toEqual(assessPortfolioRisk(products, []));
  });
});
