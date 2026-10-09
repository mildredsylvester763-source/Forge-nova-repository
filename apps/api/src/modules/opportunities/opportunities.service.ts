// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunities.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityScan } from './entities/opportunity-scan.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityQueryDto } from './dto/opportunity-query.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { OpportunityStatus, OpportunityPriority } from './enums';
import { OpportunityCrudService } from './opportunity-crud.service';
import { OpportunityScoringService } from './opportunity-scoring.service';
import { OpportunityScanService } from './opportunity-scan.service';
import { OpportunityHistoryService } from './opportunity-history.service';
import { OpportunityStatsService } from './opportunity-stats.service';

/**
 * Facade over the opportunity sub-services. The public surface is unchanged:
 * every route the controller (and any module importing OpportunitiesModule)
 * calls still lands here and is delegated to the focused service that owns
 * the behavior. The 1,300-line monolith is gone; each concern — CRUD,
 * scoring, scanning, history, statistics — lives in its own file with its
 * own dependencies.
 */
@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly crud: OpportunityCrudService,
    private readonly scoring: OpportunityScoringService,
    private readonly scan: OpportunityScanService,
    private readonly history: OpportunityHistoryService,
    private readonly stats: OpportunityStatsService,
  ) {}

  async create(userId: string, dto: CreateOpportunityDto): Promise<Opportunity> {
    return this.crud.create(userId, dto);
  }

  async findAll(userId: string, query?: OpportunityQueryDto) {
    return this.crud.findAll(userId, query);
  }

  async findOne(userId: string, id: string, request?: any): Promise<Opportunity> {
    return this.crud.findOne(userId, id, request);
  }

  async update(userId: string, id: string, dto: UpdateOpportunityDto, request?: any): Promise<Opportunity> {
    return this.crud.update(userId, id, dto, request);
  }

  async remove(userId: string, id: string, request?: any): Promise<void> {
    return this.crud.remove(userId, id, request);
  }

  async restore(userId: string, id: string, request?: any): Promise<Opportunity> {
    return this.crud.restore(userId, id, request);
  }

  async changeStatus(userId: string, id: string, newStatus: OpportunityStatus, reason?: string, request?: any): Promise<Opportunity> {
    return this.crud.changeStatus(userId, id, newStatus, reason, request);
  }

  async changePriority(userId: string, id: string, newPriority: OpportunityPriority, reason?: string, request?: any): Promise<Opportunity> {
    return this.crud.changePriority(userId, id, newPriority, reason, request);
  }

  async toggleFavorite(userId: string, id: string, request?: any): Promise<Opportunity> {
    return this.crud.toggleFavorite(userId, id, request);
  }

  async addWatcher(userId: string, id: string, watcherId: string, request?: any): Promise<Opportunity> {
    return this.crud.addWatcher(userId, id, watcherId, request);
  }

  async removeWatcher(userId: string, id: string, watcherId: string, request?: any): Promise<Opportunity> {
    return this.crud.removeWatcher(userId, id, watcherId, request);
  }

  async bulkUpdate(userId: string, ids: string[], updates: Partial<UpdateOpportunityDto>, request?: any) {
    return this.crud.bulkUpdate(userId, ids, updates, request);
  }

  async bulkDelete(userId: string, ids: string[], request?: any) {
    return this.crud.bulkDelete(userId, ids, request);
  }

  async bulkChangeStatus(userId: string, ids: string[], status: OpportunityStatus, reason?: string, request?: any) {
    return this.crud.bulkChangeStatus(userId, ids, status, reason, request);
  }

  applyFilters(where: any, filters: any): void {
    return this.crud.applyFilters(where, filters);
  }

  async calculateScore(opportunity: Opportunity): Promise<number> {
    return this.scoring.calculateScore(opportunity);
  }

  async updateScore(userId: string, id: string, request?: any): Promise<Opportunity> {
    return this.scoring.updateScore(userId, id, request);
  }

  async recalculateAllScores(userId: string, request?: any) {
    return this.scoring.recalculateAllScores(userId, request);
  }

  async scoreOpportunity(userId: string, id: string): Promise<any> {
    return this.scoring.scoreOpportunity(userId, id);
  }

  async createScan(userId: string, dto: CreateScanDto, request?: any): Promise<OpportunityScan> {
    return this.scan.createScan(userId, dto, request);
  }

  async runScan(scan: OpportunityScan, userId: string, request?: any): Promise<OpportunityScan> {
    return this.scan.runScan(scan, userId, request);
  }

  async getScans(userId: string, query?: { page?: number; limit?: number; status?: string }) {
    return this.scan.getScans(userId, query);
  }

  async getScan(userId: string, id: string): Promise<OpportunityScan> {
    return this.scan.getScan(userId, id);
  }

  async deleteScan(userId: string, id: string): Promise<void> {
    return this.scan.deleteScan(userId, id);
  }

  async triggerScan(userId: string, id: string, request?: any): Promise<OpportunityScan> {
    return this.scan.triggerScan(userId, id, request);
  }

  calculateRedditPriority(data: any): OpportunityPriority {
    return this.scan.calculateRedditPriority(data);
  }

  calculateGitHubPriority(item: any): OpportunityPriority {
    return this.scan.calculateGitHubPriority(item);
  }

  async getHistory(userId: string, opportunityId: string, query?: { page?: number; limit?: number }) {
    return this.history.getHistory(userId, opportunityId, query);
  }

  async getStatistics(userId: string): Promise<any> {
    return this.stats.getStatistics(userId);
  }
}
