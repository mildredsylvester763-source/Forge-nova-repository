// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/alerts.service.ts
// ============================================================================
// Scans the owner's real stock items against their reorder parameters, plans
// the whole scan up front, then persists: new alerts for newly low items,
// auto-resolution for items that recovered. An active alert is never
// duplicated, and acknowledged alerts never re-fire until resolved.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { LowStockAlert } from './entities/low-stock-alert.entity';
import { planLowStockScan } from './engine/alert-engine';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(StockItem)
    private readonly itemRepository: Repository<StockItem>,
    @InjectRepository(LowStockAlert)
    private readonly alertRepository: Repository<LowStockAlert>,
  ) {}

  async scan(userId: string) {
    const items = await this.itemRepository.find({ where: { userId }, order: { sku: 'ASC' } });
    const alerts = await this.alertRepository.find({ where: { userId } });
    const active = alerts.filter((a) => a.status !== 'resolved');
    const plan = planLowStockScan(
      items.map((i) => ({
        itemId: i.id,
        onHand: i.onHand,
        dailyDemand: i.dailyDemand,
        leadTimeDays: i.leadTimeDays,
        safetyStock: i.safetyStock,
      })),
      active.map((a) => a.itemId),
    );
    const skuById = new Map(items.map((i) => [i.id, i.sku]));
    const createdAlerts: LowStockAlert[] = [];
    for (const entry of plan.toAlert) {
      const alert = await this.alertRepository.save(
        this.alertRepository.create({
          userId,
          itemId: entry.itemId,
          sku: skuById.get(entry.itemId) || '',
          onHandAtAlert: entry.onHand,
          thresholdAtAlert: entry.threshold,
          status: 'open',
        }),
      );
      createdAlerts.push(alert);
    }
    const resolvedItemIds: string[] = [];
    for (const alert of active) {
      if (plan.toResolveItemIds.indexOf(alert.itemId) !== -1) {
        alert.status = 'resolved';
        await this.alertRepository.save(alert);
        resolvedItemIds.push(alert.itemId);
      }
    }
    return {
      createdAlerts,
      resolvedItemIds,
      stillLowItemIds: plan.stillLowItemIds,
      skippedItemIds: plan.skippedItemIds,
    };
  }

  async listAlerts(userId: string, status?: string) {
    const where: { userId: string; status?: string } = { userId };
    if (status) {
      where.status = status;
    }
    return this.alertRepository.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async acknowledge(userId: string, alertId: string) {
    const alert = await this.alertRepository.findOne({ where: { userId, id: alertId } });
    if (!alert) {
      throw new NotFoundException('alert-not-found');
    }
    if (alert.status !== 'open') {
      throw new BadRequestException('alert-not-open');
    }
    alert.status = 'acknowledged';
    await this.alertRepository.save(alert);
    return { alertId: alert.id, status: alert.status };
  }
}
