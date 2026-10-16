// ============================================================================
// FILE: /apps/api/src/modules/inventory/inventory.service.ts
// ============================================================================
// Movement and reorder rules live in the engines. This service loads the
// item's movement history, applies the verdict, persists the new movement
// and the updated on-hand — one transaction's worth of truth per call.
// Stock never goes negative; the engine refuses by name.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockItem } from './entities/stock-item.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { CreateStockItemDto, StockMovementDto } from './dto/inventory.dto';
import { applyMovement } from './engine/stock-ledger';
import { reorderPlan } from './engine/reorder';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(StockItem)
    private readonly itemRepository: Repository<StockItem>,
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
  ) {}

  async createItem(userId: string, dto: CreateStockItemDto): Promise<StockItem> {
    const sku = dto.sku.trim();
    const existing = await this.itemRepository.findOne({
      where: { userId, sku },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(`sku-exists:${sku}`);
    }
    return this.itemRepository.save(
      this.itemRepository.create({
        userId,
        sku,
        name: dto.name.trim(),
        ...(dto.dailyDemand !== undefined ? { dailyDemand: dto.dailyDemand } : {}),
        ...(dto.leadTimeDays !== undefined ? { leadTimeDays: dto.leadTimeDays } : {}),
        ...(dto.safetyStock !== undefined ? { safetyStock: dto.safetyStock } : {}),
        ...(dto.unitCostCents !== undefined ? { unitCostCents: dto.unitCostCents } : {}),
      }),
    );
  }

  async listItems(userId: string): Promise<StockItem[]> {
    return this.itemRepository.find({ where: { userId }, order: { sku: 'ASC' } });
  }

  async move(userId: string, itemId: string, dto: StockMovementDto) {
    const item = await this.itemRepository.findOne({ where: { userId, id: itemId } });
    if (!item) {
      throw new NotFoundException('stock-item-not-found');
    }
    const movements = await this.movementRepository.find({
      where: { userId, itemId },
      order: { at: 'ASC' },
    });
    const verdict = applyMovement(item.onHand, movements.map((m) => ({ qty: m.qty, at: m.at.toISOString() })), dto.qty);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const now = new Date();
    const movement = await this.movementRepository.save(
      this.movementRepository.create({
        userId,
        itemId,
        qty: dto.qty,
        at: now,
        ...(dto.note ? { note: dto.note } : {}),
      }),
    );
    item.onHand = verdict.value.newQty;
    await this.itemRepository.save(item);
    return {
      movementId: movement.id,
      newQty: verdict.value.newQty,
      totalMoved: verdict.value.totalMoved,
    };
  }

  async movements(userId: string, itemId: string): Promise<StockMovement[]> {
    const item = await this.itemRepository.findOne({ where: { userId, id: itemId } });
    if (!item) {
      throw new NotFoundException('stock-item-not-found');
    }
    return this.movementRepository.find({
      where: { userId, itemId },
      order: { at: 'DESC' },
      take: 200,
    });
  }

  async reorderPlanFor(userId: string, itemId: string) {
    const item = await this.itemRepository.findOne({ where: { userId, id: itemId } });
    if (!item) {
      throw new NotFoundException('stock-item-not-found');
    }
    const verdict = reorderPlan(item.onHand, item.dailyDemand, item.leadTimeDays, item.safetyStock);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      onHand: item.onHand,
      ...verdict.value,
    };
  }
}
