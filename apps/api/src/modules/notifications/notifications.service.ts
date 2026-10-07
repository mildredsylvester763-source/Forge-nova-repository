// ============================================================================
// FILE: /apps/api/src/modules/notifications/notifications.service.ts
// ============================================================================
// Notification CRUD with zero-trust scoping: every query is filtered by
// userId; ids from the URL are only ever matched against rows the user
// owns. Notifications are append-only except read-state and deletion.

import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

const VALID_TYPES: NotificationType[] = [
  'scan_completed',
  'scan_failed',
  'scan_update',
  'decision',
  'opportunity_scored',
  'system',
];

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(userId: string, input: CreateNotificationInput): Promise<Notification> {
    if (!input.title || !input.title.trim()) {
      throw new UnprocessableEntityException('Notification title is required');
    }
    if (!VALID_TYPES.includes(input.type)) {
      throw new UnprocessableEntityException('Unknown notification type: ' + input.type);
    }
    const notification = this.notificationRepository.create({
      userId,
      type: input.type,
      title: input.title.trim().slice(0, 255),
      message: (input.message || '').trim(),
      entityType: input.entityType,
      entityId: input.entityId,
    });
    return this.notificationRepository.save(notification);
  }

  async findAll(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number; unread: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.unreadOnly) where.readAt = IsNull();
    const [data, total] = await this.notificationRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      withDeleted: false,
    });
    const unread = await this.notificationRepository.count({ where: { userId, readAt: IsNull() } });
    return { data, total, page, limit, unread };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.getOwned(userId, id);
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }
    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected || 0 };
  }

  async remove(userId: string, id: string): Promise<void> {
    const notification = await this.getOwned(userId, id);
    await this.notificationRepository.softDelete(notification.id);
  }

  private async getOwned(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException('Notification with id ' + id + ' not found');
    }
    return notification;
  }
}
