// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/costing.service.ts
// ============================================================================
// Records purchase receipts against real stock items and keeps the
// weighted-average cost honest: avgCostCents is null until a receipt exists,
// margins are null until both a cost and a sell price exist, and every refusal
// leaves the cost ledger untouched.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { ItemCost } from './entities/item-cost.entity';
import { CostReceipt } from './entities/cost-receipt.entity';
import { RecordCostReceiptDto, SetSellPriceDto } from './dto/stock-insights.dto';
import {
  marginSnapshot,
  validateCostQty,
  validateSellPriceCents,
  validateUnitCostCents,
  weightedAverageCost,
} from './engine/costing-engine';

@Injectable()
export class CostingService {
  constructor(
    @InjectRepository(StockItem)
    private readonly itemRepository: Repository<StockItem>,
    @InjectRepository(ItemCost)
    private readonly costRepository: Repository<ItemCost>,
    @InjectRepository(CostReceipt)
    private readonly receiptRepository: Repository<CostReceipt>,
  ) {}

  async recordReceipt(userId: string, dto: RecordCostReceiptDto) {
    const qtyVerdict = validateCostQty(dto.qty);
    if (!qtyVerdict.ok) {
      throw new BadRequestException(qtyVerdict.reason);
    }
    const costVerdict = validateUnitCostCents(dto.unitCostCents);
    if (!costVerdict.ok) {
      throw new BadRequestException(costVerdict.reason);
    }
    const item = await this.itemRepository.findOne({ where: { userId, id: dto.itemId } });
    if (!item) {
      throw new NotFoundException('stock-item-not-found');
    }
    let cost = await this.costRepository.findOne({ where: { userId, itemId: item.id } });
    const prevQty = cost ? cost.qtyCosted : 0;
    const prevAvg = cost && cost.avgCostCents !== null ? cost.avgCostCents : 0;
    const avgVerdict = weightedAverageCost(prevQty, prevAvg, qtyVerdict.value, costVerdict.value);
    if (!avgVerdict.ok) {
      throw new BadRequestException(avgVerdict.reason);
    }
    const receipt = await this.receiptRepository.save(
      this.receiptRepository.create({
        userId,
        itemId: item.id,
        sku: item.sku,
        qty: qtyVerdict.value,
        unitCostCents: costVerdict.value,
        avgCostAfterCents: avgVerdict.value,
      }),
    );
    if (!cost) {
      cost = this.costRepository.create({
        userId,
        itemId: item.id,
        sku: item.sku,
        qtyCosted: 0,
        avgCostCents: null,
        sellPriceCents: null,
      });
    }
    cost.qtyCosted = prevQty + qtyVerdict.value;
    cost.avgCostCents = avgVerdict.value;
    await this.costRepository.save(cost);
    return {
      receiptId: receipt.id,
      itemId: item.id,
      sku: item.sku,
      avgCostCents: avgVerdict.value,
      qtyCosted: cost.qtyCosted,
    };
  }

  async setSellPrice(userId: string, dto: SetSellPriceDto) {
    const priceVerdict = validateSellPriceCents(dto.sellPriceCents);
    if (!priceVerdict.ok) {
      throw new BadRequestException(priceVerdict.reason);
    }
    const item = await this.itemRepository.findOne({ where: { userId, id: dto.itemId } });
    if (!item) {
      throw new NotFoundException('stock-item-not-found');
    }
    let cost = await this.costRepository.findOne({ where: { userId, itemId: item.id } });
    if (!cost) {
      cost = this.costRepository.create({
        userId,
        itemId: item.id,
        sku: item.sku,
        qtyCosted: 0,
        avgCostCents: null,
        sellPriceCents: null,
      });
    }
    cost.sellPriceCents = priceVerdict.value;
    await this.costRepository.save(cost);
    return { itemId: item.id, sku: item.sku, sellPriceCents: priceVerdict.value };
  }

  async marginReport(userId: string) {
    const costs = await this.costRepository.find({ where: { userId }, order: { sku: 'ASC' } });
    const items = await this.itemRepository.find({ where: { userId }, order: { sku: 'ASC' } });
    const itemById = new Map(items.map((i) => [i.id, i]));
    return costs.map((cost) => {
      const item = itemById.get(cost.itemId);
      const margin = marginSnapshot(cost.sellPriceCents, cost.avgCostCents);
      return {
        itemId: cost.itemId,
        sku: cost.sku,
        name: item ? item.name : null,
        onHand: item ? item.onHand : null,
        sellPriceCents: cost.sellPriceCents,
        avgCostCents: cost.avgCostCents,
        qtyCosted: cost.qtyCosted,
        costedValueCents: cost.avgCostCents === null ? null : cost.qtyCosted * cost.avgCostCents,
        margin,
      };
    });
  }

  async listReceipts(userId: string, itemId?: string) {
    if (itemId) {
      const item = await this.itemRepository.findOne({ where: { userId, id: itemId } });
      if (!item) {
        throw new NotFoundException('stock-item-not-found');
      }
      return this.receiptRepository.find({
        where: { userId, itemId },
        order: { createdAt: 'DESC' },
        take: 200,
      });
    }
    return this.receiptRepository.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 200 });
  }
}
