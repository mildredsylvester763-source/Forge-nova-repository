// ============================================================================
// FILE: /apps/api/src/modules/blue-ocean/blue-ocean.service.ts
// ============================================================================
// Runs the pure detector across the user's live opportunities. Only pre-death
// opportunities are considered — a killed or retired idea is not open water,
// it is closed history. Zero-trust: scoped by userId on every query.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { OpportunityCategory, OpportunityStatus } from '../opportunities/enums';
import { rankOceans, OceanCandidate, OceanReport } from './engine/blue-ocean';

const EXCLUDED_STATUSES = [
  OpportunityStatus.KILLED,
  OpportunityStatus.RETIRED,
  OpportunityStatus.ARCHIVED,
];

@Injectable()
export class BlueOceanService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async detect(userId: string, options: { category?: OpportunityCategory; limit?: number } = {}) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 500,
    });

    const candidates: OceanCandidate[] = [];
    let excludedCount = 0;

    for (const opportunity of opportunities) {
      if (options.category && opportunity.category !== options.category) continue;
      if (EXCLUDED_STATUSES.includes(opportunity.status)) {
        excludedCount++;
        continue;
      }
      candidates.push({
        id: opportunity.id,
        title: opportunity.title,
        // Postgres decimals arrive as strings; the engine needs numbers.
        demand: Number(opportunity.demandScore) || 0,
        competition: Number(opportunity.competitionScore) || 0,
        category: opportunity.category,
      });
    }

    const report: OceanReport = rankOceans(candidates);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));

    return {
      ranked: report.ranked.slice(0, limit),
      counts: report.counts,
      blueOceanCount: report.blueOceanCount,
      totalConsidered: candidates.length,
      excludedCount,
      category: options.category || null,
    };
  }
}
