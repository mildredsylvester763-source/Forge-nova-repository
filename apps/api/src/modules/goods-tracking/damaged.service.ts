// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/damaged.service.ts
// ============================================================================
// Writes damaged goods off against real stock. The engine refuses anything
// the stock cannot cover, and a refusal leaves both the stock and the log
// untouched. The log row records exactly what was written off and what
// remained.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { DamagedGoodsLog } from './entities/damaged-goods-log.entity';
import { RecordDamageDto } from './dto/goods-tracking.dto';
import {
  planDamageWriteOff,
  validateDamageNote,
  validateDamageQty,
  validateDamageReason,
} from './engine/damaged-engine';

@Injectable()
export class DamagedService {
  constructor(
    @InjectRepository(StockItem)
    private readonly itemRepository: Repository<StockItem>,
    @InjectRepository(DamagedGoodsLog)
    private readonly logRepository: Repository<DamagedGoodsLog>,
  ) {}

  async recordDamage(userId: string, dto: RecordDamageDto) {
    const qtyVerdict = validateDamageQty(dto.qty);
    if (!qtyVerdict.ok) {
      throw new BadRequestException(qtyVerdict.reason);
    }
    const reasonVerdict = validateDamageReason(dto.reason);
    if (!reasonVerdict.ok) {
      throw new BadRequestException(reasonVerdict.reason);
    }
    const noteVerdict = validateDamageNote(dto.note);
    if (!noteVerdict.ok) {
      throw new BadRequestException(noteVerdict.reason);
    }
    const item = await this.itemRepository.findOne({ where: { userId, id: dto.itemId } });
    if (!item) {
      throw new NotFoundException('stock-item-not-found');
    }
    const plan = planDamageWriteOff(item.onHand, qtyVerdict.value);
    if (!plan.ok) {
      throw new BadRequestException(plan.reason);
    }
    const log = await this.logRepository.save(
      this.logRepository.create({
        userId,
        itemId: item.id,
        sku: item.sku,
        qty: qtyVerdict.value,
        reason: reasonVerdict.value,
        note: noteVerdict.value,
        onHandAfter: plan.value,
      }),
    );
    item.onHand = plan.value;
    await this.itemRepository.save(item);
    return {
      logId: log.id,
      itemId: item.id,
      sku: item.sku,
      qty: log.qty,
      reason: log.reason,
      onHandAfter: plan.value,
    };
  }

  async listDamage(userId: string, sku?: string) {
    if (sku) {
      return this.logRepository.find({ where: { userId, sku }, order: { createdAt: 'DESC' }, take: 200 });
    }
    return this.logRepository.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 200 });
  }
}
