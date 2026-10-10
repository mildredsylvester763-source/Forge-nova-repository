// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunity-scoring.service.ts
// ============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { computeScore } from './scoring/scoring.service';
import { OpportunityHistoryService } from './opportunity-history.service';

@Injectable()
export class OpportunityScoringService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly history: OpportunityHistoryService,
  ) {}

  async calculateScore(opportunity: Opportunity): Promise<number> {
    // Single source of truth: the pure engine in ./scoring. The old local
    // weights drifted from it — two engines meant two different answers for
    // the same opportunity, and updateScore/recalculateAllScores could
    // disagree with POST :id/score. Now they cannot, structurally.
    const num = (v: any): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    return computeScore({
      demand: num(opportunity.demandScore),
      competition: num(opportunity.competitionScore),
      profitability: num(opportunity.profitabilityScore),
      feasibility: num(opportunity.feasibilityScore),
      trend: num(opportunity.trendScore),
      seasonality: num(opportunity.seasonalityScore),
    }).composite;
  }


  async updateScore(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldScore = opportunity.score;
    const newScore = await this.calculateScore(opportunity);

    opportunity.score = newScore;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.history.createHistory(id, userId, 'SCORE_CHANGE', {
      oldScore,
      newScore,
    }, request);

    return saved;
  }


  async recalculateAllScores(
    userId: string,
    request?: any,
  ): Promise<{ updated: number; total: number }> {
    const opportunities = await this.opportunityRepository.find({ where: { userId } });
    let updated = 0;

    for (const opportunity of opportunities) {
      const oldScore = opportunity.score;
      const newScore = await this.calculateScore(opportunity);

      if (oldScore !== newScore) {
        opportunity.score = newScore;
        opportunity.updatedBy = userId;
        opportunity.version = (opportunity.version || 0) + 1;
        await this.opportunityRepository.save(opportunity);

        await this.history.createHistory(opportunity.id, userId, 'SCORE_CHANGE', {
          oldScore,
          newScore,
          batchUpdate: true,
        }, request);

        updated++;
      }
    }

    return { updated, total: opportunities.length };
  }

  // ─── Scoring engine (pure core in ./scoring) ────────────────────────────
  // Computes the composite 0-100 from the six sub-scores, persists it with a
  // full explanation (factors, weights, missing signals), and returns both.
  // Missing sub-scores degrade to the neutral default and are listed —
  // never faked as real data.

  async scoreOpportunity(userId: string, id: string): Promise<any> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity ${id} not found for this user`);
    }
    // Decimal columns come back as strings; null/undefined must stay
    // "missing" (not Number(null) === 0).
    const num = (v: any): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const result = computeScore({
      demand: num(opportunity.demandScore),
      competition: num(opportunity.competitionScore),
      profitability: num(opportunity.profitabilityScore),
      feasibility: num(opportunity.feasibilityScore),
      trend: num(opportunity.trendScore),
      seasonality: num(opportunity.seasonalityScore),
    });
    opportunity.score = result.composite;
    opportunity.metadata = {
      ...(opportunity.metadata || {}),
      scoring: { ...result, computedAt: new Date().toISOString() },
    };
    const saved = await this.opportunityRepository.save(opportunity);
    return { ...result, opportunity: saved };
  }


  calculateScoreDistribution(opportunities: Opportunity[]): {
    min: number;
    max: number;
    average: number;
    median: number;
  } {
    const scores = opportunities.map(o => o.score || 0).filter(s => s > 0).sort((a, b) => a - b);
    if (!scores.length) return { min: 0, max: 0, average: 0, median: 0 };

    const sum = scores.reduce((a, b) => a + b, 0);
    const middle = Math.floor(scores.length / 2);
    const median =
      scores.length % 2 === 0
        ? (scores[middle - 1] + scores[middle]) / 2
        : scores[middle];

    return {
      min: scores[0],
      max: scores[scores.length - 1],
      average: sum / scores.length,
      median,
    };
  }


  private async getOwnedOpportunity(userId: string, id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }
    return opportunity;
  }
}

