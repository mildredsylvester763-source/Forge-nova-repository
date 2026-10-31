import { BadRequestException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { CostingService } from './costing.service';
import { AlertsService } from './alerts.service';
import { ItemCost } from './entities/item-cost.entity';
import { CostReceipt } from './entities/cost-receipt.entity';
import { LowStockAlert } from './entities/low-stock-alert.entity';

// Multi-user scenarios for cost tracking and low-stock alerts: weighted
// average cost receipts, honest margins (null until the data exists), scans
// that never duplicate an active alert, recovery auto-resolution, and
// refusals that leave zero side effects. Real services on the shared fake
// repositories.

function build() {
  const items = fakeRepo<StockItem>();
  const costs = fakeRepo<ItemCost>();
  const receipts = fakeRepo<CostReceipt>();
  const alerts = fakeRepo<LowStockAlert>();
  const costingService = new CostingService(items.repo, costs.repo, receipts.repo);
  const alertsService = new AlertsService(items.repo, alerts.repo);
  return {
    costingService,
    alertsService,
    itemRows: items.rows,
    costRows: costs.rows,
    receiptRows: receipts.rows,
    alertRows: alerts.rows,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected a refusal but the call succeeded');
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return String((error as { message?: string }).message);
    }
    throw error;
  }
}

interface SeedOpts {
  onHand: number;
  dailyDemand: number;
  leadTimeDays: number;
  safetyStock: number;
}

function seedItem(
  ctx: ReturnType<typeof build>,
  userId: string,
  id: string,
  sku: string,
  opts: SeedOpts,
): string {
  ctx.itemRows.push({
    id,
    userId,
    sku,
    name: sku + ' name',
    onHand: opts.onHand,
    dailyDemand: opts.dailyDemand,
    leadTimeDays: opts.leadTimeDays,
    safetyStock: opts.safetyStock,
    unitCostCents: 0,
    createdAt: new Date(),
  } as StockItem);
  return id;
}

describe('stock-insights functional scenarios', () => {
  it('builds weighted average cost across receipts and keeps the ledger exact', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'item-1', 'SKU-1', { onHand: 40, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    const first = await ctx.costingService.recordReceipt('owner-a', {
      itemId: 'item-1',
      qty: 10,
      unitCostCents: 200,
    });
    expect(first.avgCostCents).toBe(200);
    const second = await ctx.costingService.recordReceipt('owner-a', {
      itemId: 'item-1',
      qty: 30,
      unitCostCents: 100,
    });
    expect(second.avgCostCents).toBe(125);
    expect(second.qtyCosted).toBe(40);
    const list = await ctx.costingService.listReceipts('owner-a', 'item-1');
    expect(list).toHaveLength(2);
    expect(
      list
        .map((r) => r.avgCostAfterCents)
        .sort((a, b) => a - b),
    ).toEqual([125, 200]);
    const costRow = ctx.costRows[0];
    expect(costRow.qtyCosted).toBe(40);
    expect(costRow.avgCostCents).toBe(125);
  });

  it('reports honest margins: null until cost and price exist, negative margins kept real', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'item-1', 'SKU-1', { onHand: 10, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    seedItem(ctx, 'owner-a', 'item-2', 'SKU-2', { onHand: 4, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    await ctx.costingService.setSellPrice('owner-a', { itemId: 'item-1', sellPriceCents: 500 });
    let report = await ctx.costingService.marginReport('owner-a');
    expect(report).toHaveLength(1);
    expect(report[0].margin).toBeNull();
    expect(report[0].costedValueCents).toBeNull();
    await ctx.costingService.recordReceipt('owner-a', { itemId: 'item-1', qty: 10, unitCostCents: 250 });
    await ctx.costingService.recordReceipt('owner-a', { itemId: 'item-2', qty: 10, unitCostCents: 250 });
    await ctx.costingService.setSellPrice('owner-a', { itemId: 'item-2', sellPriceCents: 100 });
    report = await ctx.costingService.marginReport('owner-a');
    expect(report).toHaveLength(2);
    const sku1 = report.find((r) => r.sku === 'SKU-1');
    const sku2 = report.find((r) => r.sku === 'SKU-2');
    if (!sku1 || !sku2) {
      throw new Error('expected both margin rows');
    }
    expect(sku1.margin).toEqual({
      sellPriceCents: 500,
      avgCostCents: 250,
      profitCents: 250,
      marginPct: 50,
      markupPct: 100,
    });
    expect(sku1.costedValueCents).toBe(2500);
    expect(sku2.margin).toEqual({
      sellPriceCents: 100,
      avgCostCents: 250,
      profitCents: -150,
      marginPct: -150,
      markupPct: -60,
    });
  });

  it('refuses bad receipts and unknown items with zero side effects', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'item-1', 'SKU-1', { onHand: 5, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    expect(
      await refusal(ctx.costingService.recordReceipt('owner-a', { itemId: 'item-1', qty: 0, unitCostCents: 100 })),
    ).toBe('cost-invalid-qty');
    expect(
      await refusal(ctx.costingService.recordReceipt('owner-a', { itemId: 'item-1', qty: 5, unitCostCents: 0 })),
    ).toBe('cost-invalid-unit-cost');
    expect(
      await refusal(ctx.costingService.recordReceipt('owner-a', { itemId: 'missing', qty: 5, unitCostCents: 100 })),
    ).toBe('stock-item-not-found');
    expect(
      await refusal(ctx.costingService.setSellPrice('owner-a', { itemId: 'item-1', sellPriceCents: 0 })),
    ).toBe('cost-invalid-sell-price');
    expect(
      await refusal(ctx.costingService.setSellPrice('owner-a', { itemId: 'missing', sellPriceCents: 100 })),
    ).toBe('stock-item-not-found');
    expect(ctx.costRows).toHaveLength(0);
    expect(ctx.receiptRows).toHaveLength(0);
  });

  it('keeps costs and receipts invisible across owners', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'item-a', 'SHARED', { onHand: 10, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    seedItem(ctx, 'owner-b', 'item-b', 'SHARED', { onHand: 10, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    await ctx.costingService.recordReceipt('owner-a', { itemId: 'item-a', qty: 10, unitCostCents: 200 });
    await ctx.costingService.recordReceipt('owner-b', { itemId: 'item-b', qty: 10, unitCostCents: 900 });
    const reportA = await ctx.costingService.marginReport('owner-a');
    expect(reportA).toHaveLength(1);
    expect(reportA[0].itemId).toBe('item-a');
    expect(reportA[0].avgCostCents).toBe(200);
    const reportB = await ctx.costingService.marginReport('owner-b');
    expect(reportB).toHaveLength(1);
    expect(reportB[0].avgCostCents).toBe(900);
    const receiptsA = await ctx.costingService.listReceipts('owner-a');
    expect(receiptsA).toHaveLength(1);
    expect(receiptsA[0].itemId).toBe('item-a');
  });

  it('scans stock and alerts only configured low items', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'A-HEALTHY', 'A-HEALTHY', { onHand: 99, dailyDemand: 1, leadTimeDays: 1, safetyStock: 1 });
    seedItem(ctx, 'owner-a', 'B-LOW', 'B-LOW', { onHand: 2, dailyDemand: 3, leadTimeDays: 2, safetyStock: 5 });
    seedItem(ctx, 'owner-a', 'C-NOPARAMS', 'C-NOPARAMS', { onHand: 0, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 });
    const result = await ctx.alertsService.scan('owner-a');
    expect(result.createdAlerts).toHaveLength(1);
    expect(result.createdAlerts[0].itemId).toBe('B-LOW');
    expect(result.createdAlerts[0].onHandAtAlert).toBe(2);
    expect(result.createdAlerts[0].thresholdAtAlert).toBe(11);
    expect(result.createdAlerts[0].status).toBe('open');
    expect(result.skippedItemIds).toEqual(['C-NOPARAMS']);
    expect(result.stillLowItemIds).toEqual([]);
    expect(result.resolvedItemIds).toEqual([]);
    expect(ctx.alertRows).toHaveLength(1);
  });

  it('never duplicates an alert on a repeated scan', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'B-LOW', 'B-LOW', { onHand: 2, dailyDemand: 3, leadTimeDays: 2, safetyStock: 5 });
    await ctx.alertsService.scan('owner-a');
    const second = await ctx.alertsService.scan('owner-a');
    expect(second.createdAlerts).toHaveLength(0);
    expect(second.stillLowItemIds).toEqual(['B-LOW']);
    expect(ctx.alertRows).toHaveLength(1);
  });

  it('auto-resolves when stock recovers and re-alerts after a new dip', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'B-LOW', 'B-LOW', { onHand: 2, dailyDemand: 3, leadTimeDays: 2, safetyStock: 5 });
    const first = await ctx.alertsService.scan('owner-a');
    const low = ctx.itemRows.find((r) => r.id === 'B-LOW');
    if (!low) {
      throw new Error('expected the low item row');
    }
    low.onHand = 50;
    const second = await ctx.alertsService.scan('owner-a');
    expect(second.resolvedItemIds).toEqual(['B-LOW']);
    expect(ctx.alertRows[0].status).toBe('resolved');
    low.onHand = 1;
    const third = await ctx.alertsService.scan('owner-a');
    expect(third.createdAlerts).toHaveLength(1);
    expect(ctx.alertRows).toHaveLength(2);
    expect(ctx.alertRows[1].onHandAtAlert).toBe(1);
    expect(first.createdAlerts).toHaveLength(1);
  });

  it('acknowledges an open alert once, then refuses by name', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'B-LOW', 'B-LOW', { onHand: 2, dailyDemand: 3, leadTimeDays: 2, safetyStock: 5 });
    const scan = await ctx.alertsService.scan('owner-a');
    const alertId = scan.createdAlerts[0].id;
    const ack = await ctx.alertsService.acknowledge('owner-a', alertId);
    expect(ack.status).toBe('acknowledged');
    expect(await refusal(ctx.alertsService.acknowledge('owner-a', alertId))).toBe('alert-not-open');
    expect(await refusal(ctx.alertsService.acknowledge('owner-a', 'missing'))).toBe('alert-not-found');
    const again = await ctx.alertsService.scan('owner-a');
    expect(again.createdAlerts).toHaveLength(0);
    expect(again.stillLowItemIds).toEqual(['B-LOW']);
    const openList = await ctx.alertsService.listAlerts('owner-a', 'open');
    expect(openList).toHaveLength(0);
    const ackList = await ctx.alertsService.listAlerts('owner-a', 'acknowledged');
    expect(ackList).toHaveLength(1);
  });

  it('keeps alerts invisible across owners', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'A-LOW', 'A-LOW', { onHand: 0, dailyDemand: 2, leadTimeDays: 2, safetyStock: 2 });
    seedItem(ctx, 'owner-b', 'B-LOW', 'B-LOW', { onHand: 1, dailyDemand: 1, leadTimeDays: 1, safetyStock: 1 });
    const scanA = await ctx.alertsService.scan('owner-a');
    const scanB = await ctx.alertsService.scan('owner-b');
    expect(scanA.createdAlerts[0].itemId).toBe('A-LOW');
    expect(scanB.createdAlerts[0].itemId).toBe('B-LOW');
    expect(await refusal(ctx.alertsService.acknowledge('owner-b', scanA.createdAlerts[0].id))).toBe(
      'alert-not-found',
    );
    const listB = await ctx.alertsService.listAlerts('owner-b');
    expect(listB).toHaveLength(1);
    expect(listB[0].itemId).toBe('B-LOW');
  });

  it('scan respects the per-owner stock list only', async () => {
    const ctx = build();
    seedItem(ctx, 'owner-a', 'A-LOW', 'A-LOW', { onHand: 0, dailyDemand: 2, leadTimeDays: 2, safetyStock: 2 });
    const empty = await ctx.alertsService.scan('owner-b');
    expect(empty.createdAlerts).toHaveLength(0);
    expect(empty.skippedItemIds).toEqual([]);
    expect(ctx.alertRows).toHaveLength(0);
  });
});
