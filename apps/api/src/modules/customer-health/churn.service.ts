import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChurnAssessment } from './entities/churn-assessment.entity';
import { NpsResponse } from './entities/nps-response.entity';
import { scoreChurnRisk } from './engine/churn-engine';

// Churn-risk assessment. The owner supplies the billing/activity signals
// (days since last interaction, overdue invoice count, worst overdue days,
// spend trend); the service adds the customer's REAL latest recorded NPS
// score from the NPS side of this module. Every assessment is stored with
// its band, points and named factors so trends are auditable.

@Injectable()
export class ChurnService {
  constructor(
    @InjectRepository(ChurnAssessment)
    private readonly assessments: Repository<ChurnAssessment>,
    @InjectRepository(NpsResponse)
    private readonly npsResponses: Repository<NpsResponse>,
  ) {}

  private async latestNpsScore(
    ownerUserId: string,
    customerRef: string,
  ): Promise<number | null> {
    const rows = await this.npsResponses.find({ where: { ownerUserId, customerRef } });
    let best: { score: number; ts: number } | null = null;
    for (const row of rows) {
      const ts = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
      if (!Number.isFinite(ts)) continue;
      if (!best || ts > best.ts) best = { score: row.score, ts };
    }
    return best ? best.score : null;
  }

  async assess(
    ownerUserId: string,
    customerRef: string,
    input: {
      daysSinceLastInteraction: number;
      overdueInvoiceCount: number;
      maxDaysOverdue: number;
      spendTrendPercent: number;
    },
  ) {
    const latestNpsScore = await this.latestNpsScore(ownerUserId, customerRef);
    const verdict = scoreChurnRisk({ ...input, latestNpsScore });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const row = this.assessments.create({
      ownerUserId,
      customerRef,
      band: verdict.value.band,
      points: verdict.value.points,
      factors: verdict.value.factors.join('|'),
      createdAt: new Date(),
    });
    const saved = await this.assessments.save(row);
    return { ...saved, factors: verdict.value.factors };
  }

  async listAssessments(ownerUserId: string): Promise<ChurnAssessment[]> {
    return this.assessments.find({ where: { ownerUserId } });
  }
}
