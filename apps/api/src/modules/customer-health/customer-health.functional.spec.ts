import { BadRequestException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { NpsService } from './nps.service';
import { ChurnService } from './churn.service';
import { NpsResponse } from './entities/nps-response.entity';
import { ChurnAssessment } from './entities/churn-assessment.entity';

// Multi-user scenarios for NPS tracking and churn-risk flags: two owners,
// cooldowns, refusals with zero side effects, real NPS-to-churn wiring,
// and per-owner isolation. Real services on the shared fake repositories.

const DAY_MS = 24 * 3600 * 1000;

function build() {
  const responses = fakeRepo<NpsResponse>();
  const assessments = fakeRepo<ChurnAssessment>();
  const nps = new NpsService(responses.repo);
  const churn = new ChurnService(assessments.repo, responses.repo);
  return {
    nps,
    churn,
    responseRows: responses.rows,
    assessmentRows: assessments.rows,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected a refusal but the call succeeded');
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return String((error as { message?: string }).message);
  }
}

describe('customer health functional scenarios', () => {
  it('keeps two owners with the same customer completely separate', async () => {
    const ctx = build();
    await ctx.nps.recordResponse('owner-a', 'cust-1', 10, 'amazing', 'email');
    await ctx.nps.recordResponse('owner-b', 'cust-1', 0, 'terrible', 'email');
    const scoreA = await ctx.nps.computeScore('owner-a');
    const scoreB = await ctx.nps.computeScore('owner-b');
    expect(scoreA.score).toBe(100);
    expect(scoreA.total).toBe(1);
    expect(scoreB.score).toBe(-100);
    expect(scoreB.total).toBe(1);
  });

  it('refuses a second response inside the 90-day cooldown and records nothing', async () => {
    const ctx = build();
    await ctx.nps.recordResponse('owner-a', 'cust-1', 9, null, 'email');
    const rowsBefore = ctx.responseRows.length;
    const reason = await refusal(ctx.nps.recordResponse('owner-a', 'cust-1', 2, 'changed my mind', 'sms'));
    expect(reason).toBe('nps-too-frequent');
    expect(ctx.responseRows).toHaveLength(rowsBefore);
  });

  it('allows a new response after the cooldown window has passed', async () => {
    const ctx = build();
    ctx.responseRows.push({
      ownerUserId: 'owner-a',
      customerRef: 'cust-1',
      score: 5,
      segment: 'detractor',
      comment: null,
      channel: 'email',
      createdAt: new Date(Date.now() - 91 * DAY_MS),
    } as NpsResponse);
    const row = await ctx.nps.recordResponse('owner-a', 'cust-1', 10, 'much better now', 'link');
    expect(row.segment).toBe('promoter');
  });

  it('refuses invalid ratings, channels and comments with nothing recorded', async () => {
    const ctx = build();
    expect(await refusal(ctx.nps.recordResponse('owner-a', 'cust-1', 11, null, 'email'))).toBe(
      'nps-invalid-rating',
    );
    expect(await refusal(ctx.nps.recordResponse('owner-a', 'cust-1', 5, null, 'pigeon'))).toBe(
      'nps-invalid-channel',
    );
    expect(
      await refusal(ctx.nps.recordResponse('owner-a', 'cust-1', 5, 'y'.repeat(1001), 'email')),
    ).toBe('nps-comment-too-long');
    expect(ctx.responseRows).toHaveLength(0);
  });

  it('computes the standard NPS score from mixed segments', async () => {
    const ctx = build();
    const seeds: Array<[number, string]> = [
      [10, 'promoter'],
      [9, 'promoter'],
      [8, 'passive'],
      [3, 'detractor'],
    ];
    for (const [score, segment] of seeds) {
      ctx.responseRows.push({
        ownerUserId: 'owner-a',
        customerRef: 'cust-1',
        score,
        segment,
        comment: null,
        channel: 'email',
        createdAt: new Date(Date.now() - 91 * DAY_MS),
      } as NpsResponse);
    }
    const score = await ctx.nps.computeScore('owner-a');
    expect(score).toEqual({ score: 25, total: 4, promoters: 2, passives: 1, detractors: 1 });
  });

  it('refuses to compute a score when no responses exist', async () => {
    const ctx = build();
    const reason = await refusal(ctx.nps.computeScore('owner-a'));
    expect(reason).toBe('nps-no-responses');
  });

  it('lists only detractors, for closing the loop', async () => {
    const ctx = build();
    const seeds: Array<[string, number, string]> = [
      ['cust-1', 9, 'promoter'],
      ['cust-2', 3, 'detractor'],
      ['cust-3', 0, 'detractor'],
    ];
    for (const [ref, score, segment] of seeds) {
      ctx.responseRows.push({
        ownerUserId: 'owner-a',
        customerRef: ref,
        score,
        segment,
        comment: null,
        channel: 'email',
        createdAt: new Date(Date.now() - 91 * DAY_MS),
      } as NpsResponse);
    }
    const detractors = await ctx.nps.listDetractors('owner-a');
    expect(detractors).toHaveLength(2);
    expect(detractors.every((row) => row.segment === 'detractor')).toBe(true);
  });

  it('flags high churn risk with every named factor recorded', async () => {
    const ctx = build();
    ctx.responseRows.push({
      ownerUserId: 'owner-a',
      customerRef: 'cust-1',
      score: 2,
      segment: 'detractor',
      comment: 'never again',
      channel: 'email',
      createdAt: new Date(Date.now() - 91 * DAY_MS),
    } as NpsResponse);
    const result = await ctx.churn.assess('owner-a', 'cust-1', {
      daysSinceLastInteraction: 200,
      overdueInvoiceCount: 2,
      maxDaysOverdue: 60,
      spendTrendPercent: -50,
    });
    expect(result.band).toBe('high');
    expect(result.points).toBe(100);
    expect(result.factors).toContain('churn-factor-nps-detractor');
    expect(result.factors).toContain('churn-factor-inactivity');
  });

  it('pulls the real latest NPS score into the churn assessment', async () => {
    const ctx = build();
    ctx.responseRows.push({
      ownerUserId: 'owner-a',
      customerRef: 'cust-1',
      score: 9,
      segment: 'promoter',
      comment: null,
      channel: 'email',
      createdAt: new Date(Date.now() - 91 * DAY_MS),
    } as NpsResponse);
    const happy = await ctx.churn.assess('owner-a', 'cust-1', {
      daysSinceLastInteraction: 200,
      overdueInvoiceCount: 0,
      maxDaysOverdue: 0,
      spendTrendPercent: 0,
    });
    expect(happy.points).toBe(30);
    ctx.responseRows.push({
      ownerUserId: 'owner-a',
      customerRef: 'cust-1',
      score: 2,
      segment: 'detractor',
      comment: null,
      channel: 'sms',
      createdAt: new Date(Date.now() - 90 * DAY_MS),
    } as NpsResponse);
    const angry = await ctx.churn.assess('owner-a', 'cust-1', {
      daysSinceLastInteraction: 200,
      overdueInvoiceCount: 0,
      maxDaysOverdue: 0,
      spendTrendPercent: 0,
    });
    expect(angry.points).toBe(55);
    expect(angry.band).toBe('high');
    expect(angry.factors).toContain('churn-factor-nps-detractor');
  });

  it('refuses broken churn inputs with no assessment recorded', async () => {
    const ctx = build();
    const reason = await refusal(
      ctx.churn.assess('owner-a', 'cust-1', {
        daysSinceLastInteraction: 5,
        overdueInvoiceCount: 0,
        maxDaysOverdue: 0,
        spendTrendPercent: 101,
      }),
    );
    expect(reason).toBe('churn-invalid-trend');
    expect(ctx.assessmentRows).toHaveLength(0);
  });

  it('keeps churn assessments isolated per owner', async () => {
    const ctx = build();
    await ctx.churn.assess('owner-a', 'cust-1', {
      daysSinceLastInteraction: 200,
      overdueInvoiceCount: 1,
      maxDaysOverdue: 0,
      spendTrendPercent: 0,
    });
    await ctx.churn.assess('owner-b', 'cust-1', {
      daysSinceLastInteraction: 1,
      overdueInvoiceCount: 0,
      maxDaysOverdue: 0,
      spendTrendPercent: 10,
    });
    const listA = await ctx.churn.listAssessments('owner-a');
    const listB = await ctx.churn.listAssessments('owner-b');
    expect(listA).toHaveLength(1);
    expect(listA[0].band).toBe('high');
    expect(listB).toHaveLength(1);
    expect(listB[0].band).toBe('low');
  });
});
