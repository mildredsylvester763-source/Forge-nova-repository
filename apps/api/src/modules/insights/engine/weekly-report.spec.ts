import { buildWeeklyReport, ReportSnapshot } from './weekly-report';

const S = (over: Partial<ReportSnapshot>): ReportSnapshot => ({
  date: '2026-10-09',
  products: [],
  opportunities: [],
  risk: { riskScore: 0, verdict: 'empty', warnings: [] },
  ...over,
});

describe('buildWeeklyReport pinned vectors', () => {
  it('an empty portfolio gets the only honest action: ship the first draft', () => {
    const r = buildWeeklyReport(S({}));
    expect(r.pulse).toContain('empty');
    expect(r.actions[0]).toContain('ship');
  });

  it('movers rank by revenue — the 300-revenue product leads the 100 one', () => {
    const r = buildWeeklyReport(S({
      products: [
        { id: 'a', name: 'Alpha', status: 'live', revenue: 100, orders: 4 },
        { id: 'b', name: 'Beta', status: 'live', revenue: 300, orders: 12 },
      ],
    }));
    expect(r.movers[0]).toContain('Beta');
    expect(r.movers[0]).toContain('300');
  });

  it('KILL verdicts surface as the first action — money follows evidence', () => {
    const r = buildWeeklyReport(S({
      products: [{ id: 'a', name: 'Doomed', status: 'live', revenue: 50, orders: 2, verdict: 'KILL' }],
    }));
    expect(r.actions[0]).toContain('Doomed');
    expect(r.actions[0]).toContain('KILL');
  });

  it('revenue-less portfolios are told to get the first sale, plainly', () => {
    const r = buildWeeklyReport(S({
      products: [{ id: 'a', name: 'Ghost', status: 'live', revenue: 0, orders: 0 }],
    }));
    expect(r.actions.some(a => a.includes('first sale'))).toBe(true);
  });

  it('high portfolio risk becomes an action, not a footnote', () => {
    const r = buildWeeklyReport(S({
      products: [{ id: 'a', name: 'Solo', status: 'live', revenue: 100, orders: 3 }],
      risk: { riskScore: 85, verdict: 'concentrated', warnings: ['One product carries more than half of total revenue.'] },
    }));
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.actions.some(a => a.includes('85') && a.includes('diversify'))).toBe(true);
  });

  it('same snapshot, same report — always', () => {
    const snap = S({
      products: [{ id: 'a', name: 'A', status: 'live', revenue: 10, orders: 1, verdict: 'PIVOT' }],
      opportunities: [{ id: 'o', title: 'T', category: 'c', score: 50, status: 'DISCOVERED' }],
    });
    expect(buildWeeklyReport(snap)).toEqual(buildWeeklyReport(snap));
    expect(buildWeeklyReport(snap).headline).toContain('2026-10-09');
  });
});
