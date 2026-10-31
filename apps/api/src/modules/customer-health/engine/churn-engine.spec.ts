import { scoreChurnRisk } from './churn-engine';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('churn-engine (pinned vectors)', () => {
  it('scores a healthy customer low with no factors', () => {
    expect(
      scoreChurnRisk({
        daysSinceLastInteraction: 5,
        overdueInvoiceCount: 0,
        maxDaysOverdue: 0,
        spendTrendPercent: 5,
        latestNpsScore: 9,
      }),
    ).toEqual({ ok: true, value: { band: 'low', points: 0, factors: [] } });
  });

  it('adds every named factor when all signals fire (high risk)', () => {
    const verdict = scoreChurnRisk({
      daysSinceLastInteraction: 200,
      overdueInvoiceCount: 2,
      maxDaysOverdue: 60,
      spendTrendPercent: -50,
      latestNpsScore: 3,
    });
    expect(verdict).toEqual({
      ok: true,
      value: {
        band: 'high',
        points: 100,
        factors: [
          'churn-factor-inactivity',
          'churn-factor-overdue-invoices',
          'churn-factor-overdue-severity',
          'churn-factor-nps-detractor',
          'churn-factor-declining-spend',
        ],
      },
    });
  });

  it('bands medium risk correctly (overdue + detractor = 45 points)', () => {
    const verdict = scoreChurnRisk({
      daysSinceLastInteraction: 10,
      overdueInvoiceCount: 1,
      maxDaysOverdue: 0,
      spendTrendPercent: 0,
      latestNpsScore: 4,
    });
    expect(verdict.value).toEqual({
      band: 'medium',
      points: 45,
      factors: ['churn-factor-overdue-invoices', 'churn-factor-nps-detractor'],
    });
  });

  it('an overdue invoice alone is 20 points but still low band', () => {
    const verdict = scoreChurnRisk({
      daysSinceLastInteraction: 10,
      overdueInvoiceCount: 1,
      maxDaysOverdue: 0,
      spendTrendPercent: 0,
      latestNpsScore: null,
    });
    expect(verdict.value).toEqual({
      band: 'low',
      points: 20,
      factors: ['churn-factor-overdue-invoices'],
    });
  });

  it('a missing NPS score adds no detractor factor', () => {
    const verdict = scoreChurnRisk({
      daysSinceLastInteraction: 200,
      overdueInvoiceCount: 0,
      maxDaysOverdue: 0,
      spendTrendPercent: 0,
      latestNpsScore: null,
    });
    expect(verdict.value).toEqual({
      band: 'medium',
      points: 30,
      factors: ['churn-factor-inactivity'],
    });
  });

  it('refuses broken inputs with named reasons and no partial scoring', () => {
    const base = { daysSinceLastInteraction: 5, overdueInvoiceCount: 0, maxDaysOverdue: 0, spendTrendPercent: 0, latestNpsScore: null };
    expect(scoreChurnRisk({ ...base, daysSinceLastInteraction: -1 })).toEqual({
      ok: false,
      reason: 'churn-invalid-inactivity',
    });
    expect(scoreChurnRisk({ ...base, overdueInvoiceCount: -1 })).toEqual({
      ok: false,
      reason: 'churn-invalid-overdue-count',
    });
    expect(scoreChurnRisk({ ...base, maxDaysOverdue: -2 })).toEqual({
      ok: false,
      reason: 'churn-invalid-overdue-days',
    });
    expect(scoreChurnRisk({ ...base, spendTrendPercent: 101 })).toEqual({
      ok: false,
      reason: 'churn-invalid-trend',
    });
    expect(scoreChurnRisk({ ...base, latestNpsScore: 12 })).toEqual({
      ok: false,
      reason: 'churn-invalid-nps',
    });
  });
});

describe('churn-engine (500-case sweep, seed 7)', () => {
  it('points and band are always the exact sum of the fired signals', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const input = {
        daysSinceLastInteraction: Math.floor(rng() * 400) - 5,
        overdueInvoiceCount: Math.floor(rng() * 4) - 1,
        maxDaysOverdue: Math.floor(rng() * 90) - 2,
        spendTrendPercent: Math.floor(rng() * 250) - 125,
        latestNpsScore: rng() < 0.2 ? null : Math.floor(rng() * 14) - 1,
      };
      const verdict = scoreChurnRisk(input);
      const allValid =
        Number.isInteger(input.daysSinceLastInteraction) && input.daysSinceLastInteraction >= 0 &&
        Number.isInteger(input.overdueInvoiceCount) && input.overdueInvoiceCount >= 0 &&
        Number.isInteger(input.maxDaysOverdue) && input.maxDaysOverdue >= 0 &&
        Number.isInteger(input.spendTrendPercent) &&
        input.spendTrendPercent >= -100 && input.spendTrendPercent <= 100 &&
        (input.latestNpsScore === null ||
          (Number.isInteger(input.latestNpsScore) &&
            input.latestNpsScore >= 0 && input.latestNpsScore <= 10));
      expect(verdict.ok).toBe(allValid);
      if (allValid) {
        if (!verdict.ok) throw new Error('expected success');
        const expectedPoints =
          (input.daysSinceLastInteraction > 90 ? 30 : 0) +
          (input.overdueInvoiceCount > 0 ? 20 : 0) +
          (input.maxDaysOverdue > 30 ? 10 : 0) +
          (input.latestNpsScore !== null && input.latestNpsScore <= 6 ? 25 : 0) +
          (input.spendTrendPercent <= -20 ? 15 : 0);
        expect(verdict.value.points).toBe(expectedPoints);
        expect(verdict.value.band).toBe(
          expectedPoints >= 50 ? 'high' : expectedPoints >= 25 ? 'medium' : 'low',
        );
        expect(verdict.value.factors).toHaveLength(
          (input.daysSinceLastInteraction > 90 ? 1 : 0) +
            (input.overdueInvoiceCount > 0 ? 1 : 0) +
            (input.maxDaysOverdue > 30 ? 1 : 0) +
            (input.latestNpsScore !== null && input.latestNpsScore <= 6 ? 1 : 0) +
            (input.spendTrendPercent <= -20 ? 1 : 0),
        );
      }
    }
  });
});
