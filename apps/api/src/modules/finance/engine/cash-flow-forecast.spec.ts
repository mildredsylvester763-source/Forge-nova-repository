import { forecastCashFlow, RevenuePoint } from './cash-flow-forecast';

const P = (date: string, cumulativeRevenue: number): RevenuePoint => ({ date, cumulativeRevenue });

describe('forecastCashFlow pinned vectors', () => {
  it('flat history forecasts flat — and the total is the sum of its periods', () => {
    const r = forecastCashFlow([
      P('2026-09-01', 0), P('2026-09-08', 100), P('2026-09-15', 200), P('2026-09-22', 300), P('2026-09-29', 400),
    ], 4);
    expect(r.adequateData).toBe(true);
    expect(r.slopePerPeriod).toBe(0);
    expect(r.intercept).toBe(100);
    for (const fp of r.forecast) expect(fp.projectedRevenue).toBe(100);
    expect(r.forecastTotal).toBe(400);
    expect(r.forecastTotal).toBeCloseTo(r.forecast.reduce((a, x) => a + x.projectedRevenue, 0), 8);
  });

  it('a growing history projects the line forward: 100/150/200 → 250, 300', () => {
    const r = forecastCashFlow([P('2026-09-01', 0), P('2026-09-08', 100), P('2026-09-15', 250), P('2026-09-22', 450)], 2);
    expect(r.slopePerPeriod).toBe(50);
    expect(r.intercept).toBe(50);
    expect(r.forecast[0].projectedRevenue).toBe(250);
    expect(r.forecast[1].projectedRevenue).toBe(300);
    expect(r.forecastTotal).toBe(550);
  });

  it('fewer than 3 periods = an honest refusal, never a fake trend', () => {
    const r = forecastCashFlow([P('2026-09-01', 0), P('2026-09-08', 100)], 4);
    expect(r.adequateData).toBe(false);
    expect(r.forecast).toHaveLength(0);
    expect(r.warnings[0]).toContain('usable period');
  });

  it('a declining trend is named NEGATIVE in plain words', () => {
    const r = forecastCashFlow([P('2026-09-01', 0), P('2026-09-08', 200), P('2026-09-15', 300), P('2026-09-22', 350)], 4);
    expect(r.slopePerPeriod).toBeLessThan(0);
    expect(r.warnings.some(w => w.includes('NEGATIVE'))).toBe(true);
  });

  it('a refund (non-monotonic dip) clamps to zero, never negative revenue', () => {
    const r = forecastCashFlow([P('2026-09-01', 0), P('2026-09-08', 300), P('2026-09-15', 250), P('2026-09-22', 300)], 3);
    for (const fp of r.forecast) {
      expect(fp.projectedRevenue).toBeGreaterThanOrEqual(0);
      expect(fp.low).toBeGreaterThanOrEqual(0);
    }
  });

  it('the band is never narrower than the residual noise', () => {
    const r = forecastCashFlow([P('2026-09-01', 0), P('2026-09-08', 500), P('2026-09-15', 100), P('2026-09-22', 600), P('2026-09-29', 200)], 4);
    expect(r.residualStdDev).toBeGreaterThan(0);
    for (const fp of r.forecast) expect(fp.high - fp.projectedRevenue).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const h = [P('2026-09-01', 0), P('2026-09-08', 90), P('2026-09-15', 210), P('2026-09-22', 290)];
    expect(forecastCashFlow(h, 3)).toEqual(forecastCashFlow(h, 3));
  });
});
