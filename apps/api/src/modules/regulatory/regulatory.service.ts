// ============================================================================
// FILE: /apps/api/src/modules/regulatory/regulatory.service.ts
// ============================================================================
// The data layer for Feature 6. Two reads: a direct assessment from the
// query string, and an opportunity-scoped one that derives the category
// from the user's own opportunity. Zero-trust: scoped by userId.

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { assessRegulatoryRisk, RegulatoryAssessment } from './engine/regulatory-risk';

@Injectable()
export class RegulatoryService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async assess(_userId: string, country: string, category: string): Promise<RegulatoryAssessment> {
    return assessRegulatoryRisk(country, category);
  }

  async assessForOpportunity(userId: string, opportunityId: string, country: string): Promise<RegulatoryAssessment> {
    const opportunity = await this.opportunityRepository.findOne({ where: { id: opportunityId, userId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity with id ' + opportunityId + ' not found');
    }
    // The category the user is actually pursuing — never a guess from the title.
    const category = String(opportunity.category || '');
    return assessRegulatoryRisk(country, category);
  }
}
