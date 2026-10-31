import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockLocation } from './entities/stock-location.entity';
import { StockBatch } from './entities/stock-batch.entity';
import { DisposeBatchDto, PickBatchDto, ReceiveBatchDto } from './dto/warehousing.dto';
import {
  isExpiredBatch,
  isExpiringSoon,
  planBatchPick,
  validateBatchCode,
  validateBatchQty,
  validateExpiryWindow,
  validateExpiresAt,
} from './engine/batch-engine';
import { validateStockSku } from './engine/location-engine';

// Batch rules live in the engine. This service records batches against
// real locations, applies FEFO pick allocations, and disposes expired
// stock. A refused pick decrements nothing.

@Injectable()
export class BatchesService {
  constructor(
    @InjectRepository(StockLocation)
    private readonly locationRepository: Repository<StockLocation>,
    @InjectRepository(StockBatch)
    private readonly batchRepository: Repository<StockBatch>,
  ) {}

  async receiveBatch(userId: string, dto: ReceiveBatchDto): Promise<StockBatch> {
    const sku = validateStockSku(dto.sku);
    if (!sku.ok) throw new BadRequestException(sku.reason);
    const code = validateBatchCode(dto.batchCode);
    if (!code.ok) throw new BadRequestException(code.reason);
    const qty = validateBatchQty(dto.qty);
    if (!qty.ok) throw new BadRequestException(qty.reason);
    const location = await this.locationRepository.findOne({ where: { userId, id: dto.locationId } });
    if (!location) throw new NotFoundException('location-not-found');
    const nowMs = Date.now();
    const expires = validateExpiresAt(dto.expiresAtMs, nowMs);
    if (!expires.ok) throw new BadRequestException(expires.reason);
    const duplicate = await this.batchRepository.findOne({ where: { userId, sku: sku.value, batchCode: code.value } });
    if (duplicate) throw new ConflictException('batch-exists');
    return this.batchRepository.save(
      this.batchRepository.create({
        userId,
        locationId: dto.locationId,
        sku: sku.value,
        batchCode: code.value,
        expiresAt: new Date(expires.value),
        receivedQty: qty.value,
        remainingQty: qty.value,
        status: 'fresh',
      }),
    );
  }

  async listBatches(userId: string, sku?: string): Promise<StockBatch[]> {
    if (sku) {
      return this.batchRepository.find({ where: { userId, sku }, order: { expiresAt: 'ASC' } });
    }
    return this.batchRepository.find({ where: { userId }, order: { expiresAt: 'ASC' } });
  }

  async pickBatch(userId: string, dto: PickBatchDto) {
    const sku = validateStockSku(dto.sku);
    if (!sku.ok) throw new BadRequestException(sku.reason);
    const rows = await this.batchRepository.find({ where: { userId, sku: sku.value, status: 'fresh' } });
    const nowMs = Date.now();
    const plan = planBatchPick(
      rows.map((r) => ({ id: r.id, expiresAtMs: r.expiresAt.getTime(), remainingQty: r.remainingQty })),
      dto.qty,
      nowMs,
    );
    if (!plan.ok) throw new BadRequestException(plan.reason);
    for (const allocation of plan.value) {
      const row = rows.find((r) => r.id === allocation.batchId);
      if (!row) throw new NotFoundException('batch-not-found');
      row.remainingQty = row.remainingQty - allocation.qty;
      await this.batchRepository.save(row);
    }
    return { sku: sku.value, allocation: plan.value };
  }

  async disposeExpired(userId: string, dto: DisposeBatchDto) {
    let rows: StockBatch[];
    if (dto && dto.sku) {
      rows = await this.batchRepository.find({ where: { userId, sku: dto.sku, status: 'fresh' } });
    } else {
      rows = await this.batchRepository.find({ where: { userId, status: 'fresh' } });
    }
    const nowMs = Date.now();
    const disposedIds: string[] = [];
    for (const row of rows) {
      const expired = isExpiredBatch(
        { id: row.id, expiresAtMs: row.expiresAt.getTime(), remainingQty: row.remainingQty },
        nowMs,
      );
      if (expired) {
        row.status = 'disposed';
        await this.batchRepository.save(row);
        disposedIds.push(row.id);
      }
    }
    return { disposed: disposedIds.length, batchIds: disposedIds };
  }

  async expiringSoon(userId: string, rawDays: unknown, sku?: string) {
    const days = validateExpiryWindow(rawDays);
    if (!days.ok) throw new BadRequestException(days.reason);
    let rows: StockBatch[];
    if (sku) {
      rows = await this.batchRepository.find({ where: { userId, sku, status: 'fresh' } });
    } else {
      rows = await this.batchRepository.find({ where: { userId, status: 'fresh' } });
    }
    const nowMs = Date.now();
    return rows
      .filter((r) =>
        isExpiringSoon({ id: r.id, expiresAtMs: r.expiresAt.getTime(), remainingQty: r.remainingQty }, nowMs, days.value),
      )
      .map((r) => ({
        id: r.id,
        sku: r.sku,
        batchCode: r.batchCode,
        locationId: r.locationId,
        remainingQty: r.remainingQty,
        expiresAt: r.expiresAt,
      }));
  }
}
