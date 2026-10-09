// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunity-stats.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityScoringService } from './opportunity-scoring.service';

@Injectable()
export class OpportunityStatsService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly scoring: OpportunityScoringService,
  ) {}

  async getStatistics(userId: string): Promise<any> {
    const opportunities = await this.opportunityRepository.find({ where: { userId } });
    const total = opportunities.length;
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};

    let totalScore = 0;
    let minScore = total ? 100 : 0;
    let maxScore = 0;

    for (const opportunity of opportunities) {
      byCategory[opportunity.category] = (byCategory[opportunity.category] || 0) + 1;
      byStatus[opportunity.status] = (byStatus[opportunity.status] || 0) + 1;
      byPriority[opportunity.priority] = (byPriority[opportunity.priority] || 0) + 1;
      bySource[opportunity.source] = (bySource[opportunity.source] || 0) + 1;
      if (opportunity.riskLevel) {
        byRiskLevel[opportunity.riskLevel] = (byRiskLevel[opportunity.riskLevel] || 0) + 1;
      }

      totalScore += opportunity.score || 0;
      minScore = Math.min(minScore, opportunity.score || 0);
      maxScore = Math.max(maxScore, opportunity.score || 0);
    }

    return {
      total,
      byCategory,
      byStatus,
      byPriority,
      bySource,
      byRiskLevel,
      score: {
        average: total ? totalScore / total : 0,
        min: minScore,
        max: maxScore,
        distribution: this.scoring.calculateScoreDistribution(opportunities),
      },
      recent: {
        last7Days: opportunities.filter(o => o.createdAt >= new Date(Date.now() - 7 * 86400000)).length,
        last30Days: opportunities.filter(o => o.createdAt >= new Date(Date.now() - 30 * 86400000)).length,
      },
    };
  }

}

