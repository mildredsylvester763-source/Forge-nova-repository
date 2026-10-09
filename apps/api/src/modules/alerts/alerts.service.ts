// ============================================================================
// FILE: /apps/api/src/modules/alerts/alerts.service.ts
// ============================================================================
// The real-time feed: persisted notifications merged with live opportunity
// signals, ranked by the pure engine. One-click spin-up turns a pre-build
// opportunity into a DRAFT product in a single call, refuses duplicates and
// dead opportunities with named reasons, and leaves a paper trail (a
// notification, plus spinUp provenance inside the product metadata).
// Zero-trust: every query is scoped by userId.

import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../notifications/entities/notification.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { OpportunityStatus } from '../opportunities/enums';
import { Product } from '../products/entities/product.entity';
import { ProductStatus } from '../products/enums';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildAlertFeed,
  categoryToProductType,
  AlertItem,
  AlertSeverity,
} from './engine/alert-feed';

// Opportunities past this point are being built, live or dead. Spinning one
// up from the feed would only create noise.
const SPIN_UP_BLOCKED_STATUSES = [
  OpportunityStatus.BUILDING,
  OpportunityStatus.GTM_LAUNCHING,
  OpportunityStatus.OPERATIONS_ACTIVE,
  OpportunityStatus.LIVE,
  OpportunityStatus.SCALING,
  OpportunityStatus.PAUSED,
  OpportunityStatus.KILLED,
  OpportunityStatus.RETIRED,
  OpportunityStatus.ARCHIVED,
];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'draft'
  );
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getFeed(
    userId: string,
    options: { limit?: number; severity?: AlertSeverity } = {},
  ): Promise<{ data: AlertItem[]; total: number; limit: number; severity: AlertSeverity | null }> {
    const [notifications, opportunities] = await Promise.all([
      this.notificationRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      this.opportunityRepository.find({
        where: { userId },
        order: { updatedAt: 'DESC' },
        take: 500,
      }),
    ]);

    const feed = buildAlertFeed({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        entityType: n.entityType,
        entityId: n.entityId,
        occurredAt: n.createdAt.toISOString(),
      })),
      opportunities: opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        // Postgres decimals come back as strings; the engine needs numbers.
        score: Number(o.score) || 0,
        status: o.status,
        category: o.category,
        occurredAt: o.updatedAt.toISOString(),
      })),
    });

    const filtered = options.severity
      ? feed.filter((item) => item.severity === options.severity)
      : feed;

    const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
    return {
      data: filtered.slice(0, limit),
      total: filtered.length,
      limit,
      severity: options.severity || null,
    };
  }

  async spinUp(userId: string, opportunityId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId, userId },
    });
    if (!opportunity) {
      throw new NotFoundException('Opportunity with id ' + opportunityId + ' not found');
    }

    if (SPIN_UP_BLOCKED_STATUSES.includes(opportunity.status)) {
      throw new UnprocessableEntityException(
        'Opportunity is ' + opportunity.status + ' â spin-up is only for pre-build opportunities',
      );
    }

    // One opportunity, one product. A second click must never spawn a
    // second draft of the same idea.
    const existing = await this.productRepository.findOne({
      where: { userId, opportunityId },
    });
    if (existing) {
      throw new ConflictException(
        'A product already exists for this opportunity (' + existing.name + ', status ' + existing.status + ')',
      );
    }

    const mapping = categoryToProductType(opportunity.category);
    const slug = slugify(opportunity.title) + '-' + Date.now().toString(36);

    const product = this.productRepository.create({
      userId,
      accountId: opportunity.accountId,
      opportunityId: opportunity.id,
      name: opportunity.title.slice(0, 255),
      description: opportunity.description || undefined,
      slug,
      type: mapping.productType,
      status: ProductStatus.DRAFT,
      tags: opportunity.tags || undefined,
      categories: [opportunity.category],
      metadata: {
        spinUp: {
          source: 'alert_feed',
          opportunityScore: Number(opportunity.score) || 0,
          productTypeReason: mapping.reason,
          spunUpAt: new Date().toISOString(),
        },
      },
    });

    const saved = await this.productRepository.save(product);

    // Paper trail: the feed said go, and here is what got created.
    await this.notificationsService.create(userId, {
      type: 'system',
      title: 'Draft product spun up from alert',
      message:
        'Created draft product "' + saved.name + '" from opportunity ' +
        opportunity.id + ' (' + mapping.reason + ').',
      entityType: 'product',
      entityId: saved.id,
    });

    return {
      product: saved,
      productTypeReason: mapping.reason,
    };
  }
}
