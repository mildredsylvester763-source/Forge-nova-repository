// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunity-history.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { OpportunityHistory } from './entities/opportunity-history.entity';

@Injectable()
export class OpportunityHistoryService {
  constructor(
    @InjectRepository(OpportunityHistory)
    private readonly opportunityHistoryRepository: Repository<OpportunityHistory>,
  ) {}

  async createHistory(
    opportunityId: string,
    userId: string,
    action:
      | 'CREATE'
      | 'UPDATE'
      | 'DELETE'
      | 'STATUS_CHANGE'
      | 'PRIORITY_CHANGE'
      | 'SCORE_CHANGE'
      | 'ACCESS'
      | 'RESTORE',
    changes: any,
    request?: any,
  ): Promise<OpportunityHistory> {
    const history = this.opportunityHistoryRepository.create({
      id: randomUUID(),
      opportunityId,
      userId,
      action,
      changes,
      oldStatus: changes.oldStatus,
      newStatus: changes.newStatus,
      oldPriority: changes.oldPriority,
      newPriority: changes.newPriority,
      oldScore: changes.oldScore,
      newScore: changes.newScore,
      reason: changes.reason,
      source: request ? 'user' : 'system',
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      metadata: changes,
      snapshot: changes.newValues || changes,
    });

    return this.opportunityHistoryRepository.save(history);
  }


  async getHistory(
    userId: string,
    opportunityId: string,
    query?: { page?: number; limit?: number },
  ): Promise<{ data: OpportunityHistory[]; total: number; page: number; limit: number }> {
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const [data, total] = await this.opportunityHistoryRepository.findAndCount({
      where: { opportunityId, userId },
      order: { changedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['opportunity', 'user'],
    });

    return { data, total, page, limit };
  }

}

