// ============================================================================
// FILE: /apps/api/src/modules/audit/audit.service.ts
// ============================================================================
// Field-level diffs come from the engine; identical snapshots are a named
// refusal — "no change" is not an audit event. Listing is per-user and can
// be narrowed by entity name.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RecordAuditDto } from './dto/audit-log.dto';
import { diffJson } from './engine/audit-diff';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async record(userId: string, dto: RecordAuditDto): Promise<AuditLog> {
    const verdict = diffJson(dto.before, dto.after);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        entity: dto.entity,
        entityId: dto.entityId,
        action: dto.action,
        changes: verdict.value.changes,
      }),
    );
  }

  async list(userId: string, entity?: string): Promise<AuditLog[]> {
    const where: { userId: string; entity?: string } = { userId };
    if (entity) where.entity = entity;
    return this.auditLogRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async findOne(userId: string, id: string): Promise<AuditLog> {
    const row = await this.auditLogRepository.findOne({ where: { userId, id } });
    if (!row) {
      throw new NotFoundException('audit-log-not-found');
    }
    return row;
  }
}
