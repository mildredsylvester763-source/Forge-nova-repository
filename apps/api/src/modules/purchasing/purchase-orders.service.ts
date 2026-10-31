import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import { applyMovement } from '../inventory/engine/stock-ledger';
import {
  aggregatePoStatus,
  canCancelPo,
  canSendPo,
  planPurchaseOrder,
  receivePoLine,
} from './engine/purchase-order-engine';
import { CreatePurchaseOrderDto, ReceivePoLineDto } from './dto/purchasing.dto';

// Purchase orders. The lifecycle rules live in the engine; this service
// loads real rows, applies verdicts, and persists. Receiving a line pushes
// a REAL stock movement through the inventory ledger, so on-hand is never
// a hand-edited number. Honest grounding: sending an order records the
// status change; we never pretend to email the supplier.

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly lines: Repository<PurchaseOrderLine>,
    @InjectRepository(StockItem)
    private readonly items: Repository<StockItem>,
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
  ) {}

  async createDraft(userId: string, dto: CreatePurchaseOrderDto) {
    const supplier = await this.suppliers.findOne({ where: { userId, id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('supplier-not-found');
    for (const line of dto.lines) {
      const sku = typeof line.sku === 'string' ? line.sku : '';
      const item = await this.items.findOne({ where: { userId, sku: sku.trim() } });
      if (!item) throw new NotFoundException('po-unknown-sku:' + sku);
    }
    const plan = planPurchaseOrder(supplier.leadTimeDays, Date.now(), dto.lines);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    const existing = await this.orders.find({ where: { userId } });
    let poNumber = 1;
    for (const row of existing) {
      if (row.poNumber >= poNumber) poNumber = row.poNumber + 1;
    }
    const order = await this.orders.save(
      this.orders.create({
        userId,
        supplierId: supplier.id,
        poNumber,
        status: 'draft',
        expectedAt: new Date(plan.value.expectedAtMs),
        totalCents: plan.value.totalCents,
        createdAt: new Date(),
      }),
    );
    const savedLines: PurchaseOrderLine[] = [];
    for (const line of plan.value.lines) {
      const saved = await this.lines.save(
        this.lines.create({
          userId,
          orderId: order.id,
          sku: line.sku,
          qty: line.qty,
          unitCostCents: line.unitCostCents,
          receivedQty: 0,
          createdAt: new Date(),
        }),
      );
      savedLines.push(saved);
    }
    return { ...order, lines: savedLines };
  }

  async send(userId: string, orderId: string): Promise<PurchaseOrder> {
    const order = await this.requireOrder(userId, orderId);
    const verdict = canSendPo(order.status);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    order.status = 'sent';
    return this.orders.save(order);
  }

  async cancel(userId: string, orderId: string): Promise<PurchaseOrder> {
    const order = await this.requireOrder(userId, orderId);
    const lines = await this.lines.find({ where: { userId, orderId } });
    const receivedTotal = lines.reduce((sum, line) => sum + line.receivedQty, 0);
    const verdict = canCancelPo(order.status, receivedTotal);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    order.status = 'cancelled';
    return this.orders.save(order);
  }

  async receive(userId: string, orderId: string, dto: ReceivePoLineDto) {
    const order = await this.requireOrder(userId, orderId);
    const sku = typeof dto.sku === 'string' ? dto.sku.trim() : '';
    const line = await this.lines.findOne({ where: { userId, orderId, sku } });
    if (!line) throw new NotFoundException('po-line-not-found');
    const verdict = receivePoLine(order.status, line.qty, line.receivedQty, dto.qty);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const item = await this.items.findOne({ where: { userId, sku: line.sku } });
    if (!item) throw new NotFoundException('po-unknown-sku:' + line.sku);
    const history = await this.movements.find({
      where: { userId, itemId: item.id },
      order: { at: 'ASC' },
    });
    const movement = applyMovement(
      item.onHand,
      history.map((m) => ({ qty: m.qty, at: m.at.toISOString() })),
      dto.qty,
    );
    if (!movement.ok) throw new BadRequestException(movement.reason);
    await this.movements.save(
      this.movements.create({
        userId,
        itemId: item.id,
        qty: dto.qty,
        at: new Date(),
        note: 'purchase-order:' + order.id,
        createdAt: new Date(),
      }),
    );
    item.onHand = movement.value.newQty;
    await this.items.save(item);
    line.receivedQty = verdict.value.newReceivedQty;
    await this.lines.save(line);
    const allLines = await this.lines.find({ where: { userId, orderId } });
    const aggregate = aggregatePoStatus(allLines);
    if (!aggregate.ok) throw new BadRequestException(aggregate.reason);
    order.status = aggregate.value;
    await this.orders.save(order);
    return {
      orderId: order.id,
      status: order.status,
      sku: line.sku,
      receivedQty: line.receivedQty,
      newOnHand: item.onHand,
    };
  }

  async list(userId: string): Promise<PurchaseOrder[]> {
    return this.orders.find({ where: { userId }, order: { poNumber: 'DESC' } });
  }

  async listLines(userId: string, orderId: string): Promise<PurchaseOrderLine[]> {
    await this.requireOrder(userId, orderId);
    return this.lines.find({ where: { userId, orderId } });
  }

  private async requireOrder(userId: string, orderId: string): Promise<PurchaseOrder> {
    const order = await this.orders.findOne({ where: { userId, id: orderId } });
    if (!order) throw new NotFoundException('purchase-order-not-found');
    return order;
  }
}
