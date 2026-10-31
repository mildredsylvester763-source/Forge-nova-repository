import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { DamagedService } from './damaged.service';
import { ConsignmentService } from './consignment.service';
import { DamagedGoodsLog } from './entities/damaged-goods-log.entity';
import { Consignor } from './entities/consignor.entity';
import { ConsignmentLot } from './entities/consignment-lot.entity';
import { ConsignmentEvent } from './entities/consignment-event.entity';

// Multi-user scenarios for damaged-goods write-offs and consignment tracking:
// real stock decremented on damage, immutable ledgers, refusals with zero
// side effects, exact commission/payout splits and per-owner isolation.
// Real services on the shared fake repositories.

function build() {
  const items = fakeRepo<StockItem>();
  const damageLogs = fakeRepo<DamagedGoodsLog>();
  const consignors = fakeRepo<Consignor>();
  const lots = fakeRepo<ConsignmentLot>();
  const events = fakeRepo<ConsignmentEvent>();
  const damagedService = new DamagedService(items.repo, damageLogs.repo);
  const consignmentService = new ConsignmentService(consignors.repo, lots.repo, events.repo);
  return {
    damagedService,
    consignmentService,
    itemRows: items.rows,
    damageRows: damageLogs.rows,
    consignorRows: consignors.rows,
    lotRows: lots.rows,
    eventRows: events.rows,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected a refusal but the call succeeded');
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return String((error as { message?: string }).message);
    }
    throw error;
  }
}

function seedStock(
  ctx: ReturnType<typeof build>,
  userId: string,
  id: string,
  sku: string,
  onHand: number,
): string {
  ctx.itemRows.push({
    id,
    userId,
    sku,
    name: sku + ' name',
    onHand,
    dailyDemand: 0,
    leadTimeDays: 0,
    safetyStock: 0,
    unitCostCents: 0,
    createdAt: new Date(),
  } as StockItem);
  return id;
}

describe('goods-tracking functional scenarios', () => {
  it('writes damaged goods off real stock and logs exactly what remained', async () => {
    const ctx = build();
    seedStock(ctx, 'owner-a', 'item-1', 'SKU-1', 10);
    const result = await ctx.damagedService.recordDamage('owner-a', {
      itemId: 'item-1',
      qty: 3,
      reason: '  broken in transit  ',
      note: '  shelf fell  ',
    });
    expect(result.onHandAfter).toBe(7);
    expect(result.reason).toBe('broken in transit');
    expect(ctx.damageRows).toHaveLength(1);
    expect(ctx.damageRows[0].qty).toBe(3);
    expect(ctx.damageRows[0].onHandAfter).toBe(7);
    expect(ctx.damageRows[0].note).toBe('shelf fell');
    const item = ctx.itemRows.find((r) => r.id === 'item-1');
    if (!item) {
      throw new Error('expected the stock item row');
    }
    expect(item.onHand).toBe(7);
    const list = await ctx.damagedService.listDamage('owner-a');
    expect(list).toHaveLength(1);
  });

  it('refuses damage the stock cannot cover, with zero side effects', async () => {
    const ctx = build();
    seedStock(ctx, 'owner-a', 'item-1', 'SKU-1', 3);
    expect(
      await refusal(ctx.damagedService.recordDamage('owner-a', { itemId: 'item-1', qty: 4, reason: 'spilt' })),
    ).toBe('damage-insufficient-stock');
    expect(
      await refusal(ctx.damagedService.recordDamage('owner-a', { itemId: 'missing', qty: 1, reason: 'spilt' })),
    ).toBe('stock-item-not-found');
    expect(
      await refusal(ctx.damagedService.recordDamage('owner-a', { itemId: 'item-1', qty: 0, reason: 'spilt' })),
    ).toBe('damage-invalid-qty');
    expect(
      await refusal(ctx.damagedService.recordDamage('owner-a', { itemId: 'item-1', qty: 1, reason: '   ' })),
    ).toBe('damage-invalid-reason');
    expect(ctx.damageRows).toHaveLength(0);
    const item = ctx.itemRows.find((r) => r.id === 'item-1');
    if (!item) {
      throw new Error('expected the stock item row');
    }
    expect(item.onHand).toBe(3);
  });

  it('writes stock off to exactly zero and keeps the ledger immutable', async () => {
    const ctx = build();
    seedStock(ctx, 'owner-a', 'item-1', 'SKU-1', 5);
    const first = await ctx.damagedService.recordDamage('owner-a', { itemId: 'item-1', qty: 2, reason: 'spoilt' });
    expect(first.onHandAfter).toBe(3);
    const second = await ctx.damagedService.recordDamage('owner-a', { itemId: 'item-1', qty: 3, reason: 'expired' });
    expect(second.onHandAfter).toBe(0);
    expect(ctx.damageRows).toHaveLength(2);
    expect(ctx.damageRows[0].onHandAfter).toBe(3);
    expect(ctx.damageRows[1].onHandAfter).toBe(0);
  });

  it('keeps damage invisible across owners', async () => {
    const ctx = build();
    seedStock(ctx, 'owner-a', 'item-a', 'SHARED', 10);
    seedStock(ctx, 'owner-b', 'item-b', 'SHARED', 4);
    expect(
      await refusal(ctx.damagedService.recordDamage('owner-b', { itemId: 'item-a', qty: 1, reason: 'spilt' })),
    ).toBe('stock-item-not-found');
    await ctx.damagedService.recordDamage('owner-a', { itemId: 'item-a', qty: 1, reason: 'spilt' });
    const listB = await ctx.damagedService.listDamage('owner-b');
    expect(listB).toHaveLength(0);
    const listA = await ctx.damagedService.listDamage('owner-a', 'SHARED');
    expect(listA).toHaveLength(1);
  });

  it('registers consignors per owner and refuses duplicate names case-insensitively', async () => {
    const ctx = build();
    const ada = await ctx.consignmentService.createConsignor('owner-a', {
      name: '  Ada Arts  ',
      defaultCommissionPct: 20,
    });
    expect(ada.name).toBe('Ada Arts');
    expect(
      await refusal(ctx.consignmentService.createConsignor('owner-a', { name: 'ada arts', defaultCommissionPct: 20 })),
    ).toBe('consignor-name-exists');
    await ctx.consignmentService.createConsignor('owner-b', { name: 'Ada Arts', defaultCommissionPct: 10 });
    expect(
      await refusal(ctx.consignmentService.createConsignor('owner-a', { name: 'Ada', defaultCommissionPct: 101 })),
    ).toBe('consignor-invalid-commission');
    expect(ctx.consignorRows).toHaveLength(2);
  });

  it('receives consignment stock per consignor and sku', async () => {
    const ctx = build();
    const ada = await ctx.consignmentService.createConsignor('owner-a', { name: 'Ada Arts', defaultCommissionPct: 20 });
    const first = await ctx.consignmentService.receiveConsignment('owner-a', {
      consignorId: ada.id,
      sku: '  ART-1  ',
      qty: 5,
    });
    expect(first.sku).toBe('ART-1');
    expect(first.qtyOnConsignment).toBe(5);
    const second = await ctx.consignmentService.receiveConsignment('owner-a', {
      consignorId: ada.id,
      sku: 'ART-1',
      qty: 4,
    });
    expect(second.qtyOnConsignment).toBe(9);
    expect(ctx.lotRows).toHaveLength(1);
    expect(
      await refusal(
        ctx.consignmentService.receiveConsignment('owner-a', { consignorId: 'missing', sku: 'ART-1', qty: 1 }),
      ),
    ).toBe('consignor-not-found');
  });

  it('splits consignment sales into exact commission and payout', async () => {
    const ctx = build();
    const ada = await ctx.consignmentService.createConsignor('owner-a', { name: 'Ada Arts', defaultCommissionPct: 20 });
    await ctx.consignmentService.receiveConsignment('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 10 });
    const sale = await ctx.consignmentService.recordSale('owner-a', {
      consignorId: ada.id,
      sku: 'ART-1',
      qty: 3,
      unitPriceCents: 500,
    });
    expect(sale.totalCents).toBe(1500);
    expect(sale.commissionCents).toBe(300);
    expect(sale.payoutCents).toBe(1200);
    expect(sale.qtyOnConsignment).toBe(7);
    expect(ctx.eventRows).toHaveLength(1);
    expect(ctx.eventRows[0].kind).toBe('sale');
  });

  it('refuses sales the consigned stock cannot cover, with zero side effects', async () => {
    const ctx = build();
    const ada = await ctx.consignmentService.createConsignor('owner-a', { name: 'Ada Arts', defaultCommissionPct: 20 });
    await ctx.consignmentService.receiveConsignment('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 2 });
    expect(
      await refusal(
        ctx.consignmentService.recordSale('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 3, unitPriceCents: 500 }),
      ),
    ).toBe('consignment-insufficient-stock');
    expect(
      await refusal(
        ctx.consignmentService.recordSale('owner-a', { consignorId: ada.id, sku: 'MISSING', qty: 1, unitPriceCents: 500 }),
      ),
    ).toBe('consignment-lot-not-found');
    expect(ctx.eventRows).toHaveLength(0);
    const lot = ctx.lotRows[0];
    expect(lot.qtyOnConsignment).toBe(2);
  });

  it('returns unsold consignment stock and records the event honestly', async () => {
    const ctx = build();
    const ada = await ctx.consignmentService.createConsignor('owner-a', { name: 'Ada Arts', defaultCommissionPct: 20 });
    await ctx.consignmentService.receiveConsignment('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 6 });
    const returned = await ctx.consignmentService.returnConsignment('owner-a', {
      consignorId: ada.id,
      sku: 'ART-1',
      qty: 4,
    });
    expect(returned.qtyOnConsignment).toBe(2);
    expect(ctx.eventRows).toHaveLength(1);
    expect(ctx.eventRows[0].kind).toBe('return');
    expect(ctx.eventRows[0].totalCents).toBeNull();
    expect(
      await refusal(
        ctx.consignmentService.returnConsignment('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 3 }),
      ),
    ).toBe('consignment-insufficient-stock');
    expect(ctx.eventRows).toHaveLength(1);
    expect(ctx.lotRows[0].qtyOnConsignment).toBe(2);
  });

  it('summarises a consignor exactly across lots, sales and returns', async () => {
    const ctx = build();
    const ada = await ctx.consignmentService.createConsignor('owner-a', { name: 'Ada Arts', defaultCommissionPct: 25 });
    const ben = await ctx.consignmentService.createConsignor('owner-a', { name: 'Ben Pottery', defaultCommissionPct: 10 });
    await ctx.consignmentService.receiveConsignment('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 10 });
    await ctx.consignmentService.receiveConsignment('owner-a', { consignorId: ada.id, sku: 'ART-2', qty: 4 });
    await ctx.consignmentService.receiveConsignment('owner-a', { consignorId: ben.id, sku: 'ART-1', qty: 8 });
    await ctx.consignmentService.recordSale('owner-a', { consignorId: ada.id, sku: 'ART-1', qty: 2, unitPriceCents: 1000 });
    await ctx.consignmentService.recordSale('owner-a', { consignorId: ada.id, sku: 'ART-2', qty: 1, unitPriceCents: 400 });
    await ctx.consignmentService.returnConsignment('owner-a', { consignorId: ada.id, sku: 'ART-2', qty: 2 });
    const summary = await ctx.consignmentService.summary('owner-a', ada.id);
    expect(summary.consignor.name).toBe('Ada Arts');
    expect(summary.totals.qtyOnConsignment).toBe(11);
    expect(summary.totals.soldQty).toBe(3);
    expect(summary.totals.returnedQty).toBe(2);
    expect(summary.totals.totalSalesCents).toBe(2400);
    expect(summary.totals.commissionCents).toBe(600);
    expect(summary.totals.payoutOwedCents).toBe(1800);
    expect(
      await refusal(ctx.consignmentService.summary('owner-b', ada.id)),
    ).toBe('consignor-not-found');
  });
});
