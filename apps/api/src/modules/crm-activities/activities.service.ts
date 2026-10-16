// ============================================================================
// FILE: /apps/api/src/modules/crm-activities/activities.service.ts
// ============================================================================
// Ranking lives in the engine; this service loads the user's open actions,
// maps them onto ActionCandidate, and joins titles back onto the ranked
// output. Completing an action stamps lastDoneAt — the stale boost decays
// from that moment.

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from './entities/activity.entity';
import { CreateActivityDto } from './dto/activity.dto';
import { ActionCandidate, rankNextActions } from './engine/next-action';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  async create(userId: string, dto: CreateActivityDto): Promise<Activity> {
    return this.activityRepository.save(
      this.activityRepository.create({
        userId,
        title: dto.title.trim(),
        ...(dto.kind ? { kind: dto.kind } : {}),
        ...(dto.contactId ? { contactId: dto.contactId } : {}),
        ...(dto.dueAt ? { dueAt: new Date(dto.dueAt) } : {}),
        ...(dto.valueCents !== undefined ? { valueCents: dto.valueCents } : {}),
        ...(dto.notes ? { notes: dto.notes } : {}),
      }),
    );
  }

  async list(userId: string): Promise<Activity[]> {
    return this.activityRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async nextActions(userId: string) {
    const rows = await this.activityRepository.find({ where: { userId } });
    const candidates: ActionCandidate[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      ...(r.dueAt ? { dueAt: r.dueAt.toISOString() } : {}),
      ...(r.valueCents !== undefined ? { valueCents: r.valueCents } : {}),
      ...(r.lastDoneAt ? { lastDoneAt: r.lastDoneAt.toISOString() } : {}),
    }));
    const verdict = rankNextActions(candidates, new Date());
    if (!verdict.ok) {
      return { ranked: [] };
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      ranked: verdict.value.ranked.map((ranked) => ({
        ...ranked,
        title: byId.get(ranked.id)?.title ?? '',
      })),
    };
  }

  async complete(userId: string, id: string): Promise<Activity> {
    const row = await this.activityRepository.findOne({ where: { userId, id } });
    if (!row) {
      throw new NotFoundException('activity-not-found');
    }
    row.lastDoneAt = new Date();
    return this.activityRepository.save(row);
  }
}
