// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunity-crud.service.ts
// ============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, MoreThan, LessThan, Between, ILike } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityQueryDto } from './dto/opportunity-query.dto';
import { OpportunityStatus, OpportunityPriority } from './enums';
import { ConfigService } from '@nestjs/config';
import { OpportunityHistoryService } from './opportunity-history.service';

@Injectable()
export class OpportunityCrudService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly configService: ConfigService,
    private readonly history: OpportunityHistoryService,
  ) {}

  async create(userId: string, dto: CreateOpportunityDto): Promise<Opportunity> {
    const opportunity = this.opportunityRepository.create({
      ...dto,
      userId,
      accountId: userId,
    });
    const saved = await this.opportunityRepository.save(opportunity);

    await this.history.createHistory(saved.id, userId, 'CREATE', {
      action: 'create',
      by: userId,
      changes: dto,
    });

    return saved;
  }


  async findAll(
    userId: string,
    query?: OpportunityQueryDto,
  ): Promise<{ data: Opportunity[]; total: number }> {
    const where: any = { userId, accountId: userId };

    if (query) {
      if (query.category) where.category = query.category;
      if (query.source) where.source = query.source;
      if (query.status) where.status = query.status;
      if (query.priority) where.priority = query.priority;
      if (query.riskLevel) where.riskLevel = query.riskLevel;

      if (query.search) {
        const searchField = this.configService.get<string>('database.searchField') || 'title';
        where[searchField] = ILike('%' + query.search + '%');
      }
    }

    const [data, total] = await this.opportunityRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query?.skip || 0,
      take: query?.take || 50,
    });

    return { data, total };
  }


  async findOne(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
      relations: ['histories', 'scans', 'user'],
    });

    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    if (request) {
      await this.history.createHistory(
        id,
        userId,
        'ACCESS',
        { action: 'view', accessedAt: new Date().toISOString() },
        request,
      );
    }

    return opportunity;
  }


  async update(
    userId: string,
    id: string,
    dto: UpdateOpportunityDto,
    request?: any,
  ): Promise<Opportunity> {
    const existing = await this.opportunityRepository.findOne({
      where: { id, userId },
      relations: ['user'],
    });

    if (!existing) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    const oldValues = this.sanitizeForHistory(existing);
    this.opportunityRepository.merge(existing, {
      ...dto,
      updatedBy: userId,
      version: (existing.version || 0) + 1,
    });

    const saved = await this.opportunityRepository.save(existing);
    const changes: any = { oldValues: {}, newValues: {} };

    for (const key of Object.keys(dto)) {
      const newValue = (dto as any)[key];
      if (
        newValue !== undefined &&
        JSON.stringify(newValue) !== JSON.stringify(oldValues[key])
      ) {
        changes.oldValues[key] = oldValues[key];
        changes.newValues[key] = newValue;
      }
    }

    if (Object.keys(changes.oldValues).length) {
      await this.history.createHistory(id, userId, 'UPDATE', changes, request);
    }

    return saved;
  }


  async remove(userId: string, id: string, request?: any): Promise<void> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    await this.opportunityRepository.softDelete(id);
    await this.history.createHistory(
      id,
      userId,
      'DELETE',
      { oldValues: this.sanitizeForHistory(opportunity), newValues: null },
      request,
    );
  }


  async restore(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
      withDeleted: true,
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    await this.opportunityRepository.restore(id);
    await this.history.createHistory(
      id,
      userId,
      'RESTORE',
      { oldValues: null, newValues: this.sanitizeForHistory(opportunity) },
      request,
    );

    return opportunity;
  }


  async changeStatus(
    userId: string,
    id: string,
    newStatus: OpportunityStatus,
    reason?: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldStatus = opportunity.status;

    opportunity.status = newStatus;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const now = new Date();
    switch (newStatus) {
      case OpportunityStatus.VALIDATING:
        opportunity.validatedAt = now;
        break;
      case OpportunityStatus.APPROVED:
        opportunity.approvedAt = now;
        break;
      case OpportunityStatus.GTM_LAUNCHING:
      case OpportunityStatus.OPERATIONS_ACTIVE:
        opportunity.launchedAt = now;
        break;
      case OpportunityStatus.KILLED:
        opportunity.killedAt = now;
        break;
      case OpportunityStatus.RETIRED:
        opportunity.retiredAt = now;
        break;
      case OpportunityStatus.PAUSING:
        opportunity.pausedAt = now;
        break;
    }

    const saved = await this.opportunityRepository.save(opportunity);
    await this.history.createHistory(id, userId, 'STATUS_CHANGE', {
      oldStatus,
      newStatus,
      reason,
    }, request);

    return saved;
  }


  async changePriority(
    userId: string,
    id: string,
    newPriority: OpportunityPriority,
    reason?: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldPriority = opportunity.priority;

    opportunity.priority = newPriority;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.history.createHistory(id, userId, 'PRIORITY_CHANGE', {
      oldPriority,
      newPriority,
      reason,
    }, request);

    return saved;
  }


  async toggleFavorite(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldValue = opportunity.isFavorite;

    opportunity.isFavorite = !opportunity.isFavorite;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.history.createHistory(id, userId, 'UPDATE', {
      oldValues: { isFavorite: oldValue },
      newValues: { isFavorite: saved.isFavorite },
    }, request);

    return saved;
  }


  async addWatcher(
    userId: string,
    id: string,
    watcherId: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldWatchers = [...(opportunity.watchers || [])];

    if (!opportunity.watchers) opportunity.watchers = [];
    if (opportunity.watchers.includes(watcherId)) return opportunity;

    opportunity.watchers.push(watcherId);
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.history.createHistory(id, userId, 'UPDATE', {
      oldValues: { watchers: oldWatchers },
      newValues: { watchers: saved.watchers },
    }, request);

    return saved;
  }


  async removeWatcher(
    userId: string,
    id: string,
    watcherId: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldWatchers = [...(opportunity.watchers || [])];

    if (!opportunity.watchers) return opportunity;

    opportunity.watchers = opportunity.watchers.filter(w => w !== watcherId);
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.history.createHistory(id, userId, 'UPDATE', {
      oldValues: { watchers: oldWatchers },
      newValues: { watchers: saved.watchers },
    }, request);

    return saved;
  }


  async bulkUpdate(
    userId: string,
    ids: string[],
    updates: Partial<UpdateOpportunityDto>,
    request?: any,
  ): Promise<{ updated: number; failed: number; errors: string[] }> {
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.update(userId, id, updates, request);
        updated++;
      } catch (error: any) {
        failed++;
        errors.push(`${id}: ${error.message}`);
      }
    }

    return { updated, failed, errors };
  }


  async bulkDelete(
    userId: string,
    ids: string[],
    request?: any,
  ): Promise<{ deleted: number; failed: number; errors: string[] }> {
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.remove(userId, id, request);
        deleted++;
      } catch (error: any) {
        failed++;
        errors.push(`${id}: ${error.message}`);
      }
    }

    return { deleted, failed, errors };
  }


  async bulkChangeStatus(
    userId: string,
    ids: string[],
    status: OpportunityStatus,
    reason?: string,
    request?: any,
  ): Promise<{ changed: number; failed: number; errors: string[] }> {
    let changed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.changeStatus(userId, id, status, reason, request);
        changed++;
      } catch (error: any) {
        failed++;
        errors.push(`${id}: ${error.message}`);
      }
    }

    return { changed, failed, errors };
  }


  applyFilters(where: any, filters: any): void {
    if (filters.search) {
      where.title = ILike(`%${filters.search}%`);
    }
    if (filters.categories?.length) where.category = In(filters.categories);
    if (filters.sources?.length) where.source = In(filters.sources);
    if (filters.statuses?.length) where.status = In(filters.statuses);
    if (filters.priorities?.length) where.priority = In(filters.priorities);
    if (filters.riskLevels?.length) where.riskLevel = In(filters.riskLevels);

    if (filters.minScore !== undefined && filters.maxScore !== undefined) {
      where.score = Between(filters.minScore, filters.maxScore);
    } else if (filters.minScore !== undefined) {
      where.score = MoreThan(filters.minScore);
    } else if (filters.maxScore !== undefined) {
      where.score = LessThan(filters.maxScore);
    }

    if (filters.minDemandScore !== undefined) where.demandScore = MoreThan(filters.minDemandScore);
    if (filters.maxCompetitionScore !== undefined) where.competitionScore = LessThan(filters.maxCompetitionScore);
    if (filters.discoveredBefore) where.discoveredAt = LessThan(new Date(filters.discoveredBefore));
    if (filters.createdAfter && filters.createdBefore) {
      where.createdAt = Between(new Date(filters.createdAfter), new Date(filters.createdBefore));
    } else if (filters.createdAfter) {
      where.createdAt = MoreThan(new Date(filters.createdAfter));
    } else if (filters.createdBefore) {
      where.createdAt = LessThan(new Date(filters.createdBefore));
    }
    if (filters.updatedAfter) where.updatedAt = MoreThan(new Date(filters.updatedAfter));
    if (filters.portfolioId) where.portfolioId = filters.portfolioId;
    if (filters.businessId) where.businessId = filters.businessId;
    if (filters.isFavorite !== undefined) where.isFavorite = filters.isFavorite;
    if (filters.isArchived !== undefined) where.isArchived = filters.isArchived;
    if (filters.isHidden !== undefined) where.isHidden = filters.isHidden;
    if (filters.hasPortfolio !== undefined) where.portfolioId = filters.hasPortfolio ? Not(null) : null;
    if (filters.hasBusiness !== undefined) where.businessId = filters.hasBusiness ? Not(null) : null;
  }


  private sanitizeForHistory(opportunity: Opportunity): any {
    // Strip relation collections — history rows store a flat snapshot.
    const sanitized: any = { ...opportunity };
    delete sanitized.histories;
    delete sanitized.scans;
    return { ...sanitized, userId: opportunity.userId };
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

