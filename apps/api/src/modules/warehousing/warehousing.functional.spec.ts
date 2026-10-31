import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { LocationsService } from './locations.service';
import { BatchesService } from './batches.service';
import { StockLocation } from './entities/stock-location.entity';
import { LocationStock } from './entities/location-stock.entity';
import { StockBatch } from './entities/stock-batch.entity';

// Multi-user scenarios for multi-location stock and batch expiry control:
// per-owner location names, per-location stock, transfers that refuse when
// the source cannot cover them, FEFO picks across batches, expired stock
// that is never picked, disposal, and per-owner isolation everywhere.
// Real services on the shared fake repositories.

const DAY_MS = 24 * 3600 * 1000;

function build() {
  const locations = fakeRepo<StockLocation>();
  const locationStock = fakeRepo<LocationStock>();
  const batches = fakeRepo<StockBatch>();
  const locationsService = new LocationsService(locations.repo, locationStock.repo);
  const batchesService = new BatchesService(locations.repo, batches.repo);
  return {
    locationsService,
    batchesService,
    locationRows: locations.rows,
    stockRows: locationStock.rows,
    batchRows: batches.rows,
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

async function seedBatch(
  ctx: ReturnType<typeof build>,
  userId: string,
  locationId: string,
  sku: string,
  batchCode: string,
  remainingQty: number,
  expiresAtMs: number,
) {
  ctx.batchRows.push({
    userId,
    locationId,
    sku,
    batchCode,
    expiresAt: new Date(expiresAtMs),
    receivedQty: remainingQty,
    remainingQty,
    status: 'fresh',
    createdAt: new Date(),
  } as StockBatch);
}

describe('warehousing functional scenarios', () => {
  it('lets two owners share a location name but not within one owner', async () => {
    const ctx = build();
    const a = await ctx.locationsService.createLocation('owner-a', { name: 'Main Store' });
    await ctx.locationsService.createLocation('owner-b', { name: 'Main Store' });
    expect(ctx.locationRows).toHaveLength(2);
    expect(await refusal(ctx.locationsService.createLocation('owner-a', { name: 'main store' }))).toBe(
      'location-name-exists',
    );
    expect(ctx.locationRows).toHaveLength(2);
    expect(a.name).toBe('Main Store');
  });

  it('receives stock per location and keeps the listing exact', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const first = await ctx.locationsService.receiveStock('owner-a', {
      locationId: loc.id,
      sku: ' SKU-1 ',
      qty: 5,
    });
    expect(first.onHand).toBe(5);
    expect(first.sku).toBe('SKU-1');
    const second = await ctx.locationsService.receiveStock('owner-a', {
      locationId: loc.id,
      sku: 'SKU-1',
      qty: 3,
    });
    expect(second.onHand).toBe(8);
    const listing = await ctx.locationsService.locationStock('owner-a', loc.id);
    expect(listing).toHaveLength(1);
    expect(listing[0].onHand).toBe(8);
    expect(await refusal(ctx.locationsService.receiveStock('owner-a', { locationId: loc.id, sku: 'SKU-1', qty: 0 }))).toBe(
      'location-invalid-qty',
    );
  });

  it('transfers stock between locations and keeps both sides exact', async () => {
    const ctx = build();
    const warehouse = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const store = await ctx.locationsService.createLocation('owner-a', { name: 'Store' });
    await ctx.locationsService.receiveStock('owner-a', { locationId: warehouse.id, sku: 'SKU-1', qty: 10 });
    const moved = await ctx.locationsService.transferStock('owner-a', {
      fromLocationId: warehouse.id,
      toLocationId: store.id,
      sku: 'SKU-1',
      qty: 4,
    });
    expect(moved.from).toBe(6);
    expect(moved.to).toBe(4);
    const again = await ctx.locationsService.transferStock('owner-a', {
      fromLocationId: warehouse.id,
      toLocationId: store.id,
      sku: 'SKU-1',
      qty: 6,
    });
    expect(again.from).toBe(0);
    expect(again.to).toBe(10);
    const totals = await ctx.locationsService.skuTotals('owner-a', 'SKU-1');
    expect(totals.total).toBe(10);
    expect(totals.locations).toHaveLength(2);
  });

  it('refuses a transfer the source cannot cover, with zero side effects', async () => {
    const ctx = build();
    const warehouse = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const store = await ctx.locationsService.createLocation('owner-a', { name: 'Store' });
    await ctx.locationsService.receiveStock('owner-a', { locationId: warehouse.id, sku: 'SKU-1', qty: 3 });
    const before = ctx.stockRows.length;
    expect(
      await refusal(
        ctx.locationsService.transferStock('owner-a', {
          fromLocationId: warehouse.id,
          toLocationId: store.id,
          sku: 'SKU-1',
          qty: 5,
        }),
      ),
    ).toBe('location-insufficient-stock');
    expect(ctx.stockRows).toHaveLength(before);
    const warehouseRow = ctx.stockRows.find((r) => r.sku === 'SKU-1' && r.locationId === warehouse.id);
    if (!warehouseRow) throw new Error('expected the warehouse row');
    expect(warehouseRow.onHand).toBe(3);
  });

  it('refuses transfers to the same or unknown locations', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    await ctx.locationsService.receiveStock('owner-a', { locationId: loc.id, sku: 'SKU-1', qty: 5 });
    expect(
      await refusal(
        ctx.locationsService.transferStock('owner-a', {
          fromLocationId: loc.id,
          toLocationId: loc.id,
          sku: 'SKU-1',
          qty: 1,
        }),
      ),
    ).toBe('location-transfer-same');
    expect(
      await refusal(
        ctx.locationsService.transferStock('owner-a', {
          fromLocationId: 'missing',
          toLocationId: loc.id,
          sku: 'SKU-1',
          qty: 1,
        }),
      ),
    ).toBe('location-not-found');
    expect(
      await refusal(
        ctx.locationsService.transferStock('owner-a', {
          fromLocationId: loc.id,
          toLocationId: 'missing',
          sku: 'SKU-1',
          qty: 1,
        }),
      ),
    ).toBe('location-to-not-found');
    expect(ctx.stockRows).toHaveLength(1);
  });

  it('keeps locations and stock invisible across owners', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    await ctx.locationsService.receiveStock('owner-a', { locationId: loc.id, sku: 'SKU-1', qty: 5 });
    expect(await refusal(ctx.locationsService.locationStock('owner-b', loc.id))).toBe('location-not-found');
    expect(
      await refusal(ctx.locationsService.receiveStock('owner-b', { locationId: loc.id, sku: 'SKU-1', qty: 1 })),
    ).toBe('location-not-found');
    const bList = await ctx.locationsService.listLocations('owner-b');
    expect(bList).toHaveLength(0);
    const bTotals = await ctx.locationsService.skuTotals('owner-b', 'SKU-1');
    expect(bTotals.total).toBe(0);
  });

  it('records batches against real locations with unique codes per sku and owner', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const now = Date.now();
    const batch = await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'MILK',
      batchCode: ' LOT-1 ',
      qty: 10,
      expiresAtMs: now + 7 * DAY_MS,
    });
    expect(batch.batchCode).toBe('LOT-1');
    expect(batch.remainingQty).toBe(10);
    expect(batch.status).toBe('fresh');
    expect(
      await refusal(
        ctx.batchesService.receiveBatch('owner-a', {
          locationId: loc.id,
          sku: 'MILK',
          batchCode: 'LOT-1',
          qty: 5,
          expiresAtMs: now + 7 * DAY_MS,
        }),
      ),
    ).toBe('batch-exists');
    expect(ctx.batchRows).toHaveLength(1);
    const otherOwner = await ctx.batchesService.receiveBatch('owner-b', {
      locationId: (await ctx.locationsService.createLocation('owner-b', { name: 'Warehouse' })).id,
      sku: 'MILK',
      batchCode: 'LOT-1',
      qty: 5,
      expiresAtMs: now + 7 * DAY_MS,
    });
    expect(otherOwner.status).toBe('fresh');
    expect(
      await refusal(
        ctx.batchesService.receiveBatch('owner-a', {
          locationId: loc.id,
          sku: 'MILK',
          batchCode: 'LOT-2',
          qty: 5,
          expiresAtMs: now - DAY_MS,
        }),
      ),
    ).toBe('batch-expiry-in-past');
    expect(
      await refusal(
        ctx.batchesService.receiveBatch('owner-a', {
          locationId: loc.id,
          sku: 'MILK',
          batchCode: 'LOT-2',
          qty: 5,
          expiresAtMs: now + 11 * 365 * DAY_MS,
        }),
      ),
    ).toBe('batch-expiry-too-far');
    expect(ctx.batchRows).toHaveLength(2);
  });

  it('picks FEFO across batches and splits the allocation', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const now = Date.now();
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'MILK',
      batchCode: 'LOT-LATE',
      qty: 4,
      expiresAtMs: now + 30 * DAY_MS,
    });
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'MILK',
      batchCode: 'LOT-EARLY',
      qty: 4,
      expiresAtMs: now + 10 * DAY_MS,
    });
    const picked = await ctx.batchesService.pickBatch('owner-a', { sku: 'MILK', qty: 6 });
    expect(picked.allocation).toHaveLength(2);
    expect(picked.allocation[0].qty).toBe(4);
    expect(picked.allocation[1].qty).toBe(2);
    const rows = await ctx.batchesService.listBatches('owner-a', 'MILK');
    const early = rows.find((r) => r.batchCode === 'LOT-EARLY');
    const late = rows.find((r) => r.batchCode === 'LOT-LATE');
    if (!early || !late) throw new Error('expected both batch rows');
    expect(early.remainingQty).toBe(0);
    expect(late.remainingQty).toBe(2);
  });

  it('refuses an under-covered pick with zero side effects', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const now = Date.now();
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'MILK',
      batchCode: 'LOT-1',
      qty: 4,
      expiresAtMs: now + 10 * DAY_MS,
    });
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'MILK',
      batchCode: 'LOT-2',
      qty: 2,
      expiresAtMs: now + 20 * DAY_MS,
    });
    expect(await refusal(ctx.batchesService.pickBatch('owner-a', { sku: 'MILK', qty: 10 }))).toBe(
      'batch-insufficient-stock',
    );
    const rows = await ctx.batchesService.listBatches('owner-a', 'MILK');
    expect(rows.reduce((acc, r) => acc + r.remainingQty, 0)).toBe(6);
  });

  it('never picks expired stock and leaves it untouched', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const now = Date.now();
    await seedBatch(ctx, 'owner-a', loc.id, 'MILK', 'LOT-OLD', 5, now - DAY_MS);
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'MILK',
      batchCode: 'LOT-NEW',
      qty: 3,
      expiresAtMs: now + 20 * DAY_MS,
    });
    const picked = await ctx.batchesService.pickBatch('owner-a', { sku: 'MILK', qty: 3 });
    expect(picked.allocation).toHaveLength(1);
    expect(picked.allocation[0].qty).toBe(3);
    expect(await refusal(ctx.batchesService.pickBatch('owner-a', { sku: 'MILK', qty: 1 }))).toBe(
      'batch-insufficient-stock',
    );
    const old = ctx.batchRows.find((r) => r.batchCode === 'LOT-OLD');
    if (!old) throw new Error('expected the old batch row');
    expect(old.remainingQty).toBe(5);
    expect(old.status).toBe('fresh');
  });

  it('disposes only expired batches and lists what is expiring soon', async () => {
    const ctx = build();
    const loc = await ctx.locationsService.createLocation('owner-a', { name: 'Warehouse' });
    const now = Date.now();
    await seedBatch(ctx, 'owner-a', loc.id, 'YOGURT', 'EXPIRED', 5, now - DAY_MS);
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'YOGURT',
      batchCode: 'SOON',
      qty: 4,
      expiresAtMs: now + 3 * DAY_MS,
    });
    await ctx.batchesService.receiveBatch('owner-a', {
      locationId: loc.id,
      sku: 'YOGURT',
      batchCode: 'LATER',
      qty: 4,
      expiresAtMs: now + 100 * DAY_MS,
    });
    const disposed = await ctx.batchesService.disposeExpired('owner-a', {});
    expect(disposed.disposed).toBe(1);
    const expiredRow = ctx.batchRows.find((r) => r.batchCode === 'EXPIRED');
    if (!expiredRow) throw new Error('expected the expired batch row');
    expect(expiredRow.status).toBe('disposed');
    const secondRun = await ctx.batchesService.disposeExpired('owner-a', {});
    expect(secondRun.disposed).toBe(0);
    const soon = await ctx.batchesService.expiringSoon('owner-a', 7, 'YOGURT');
    expect(soon).toHaveLength(1);
    expect(soon[0].batchCode).toBe('SOON');
    expect(await refusal(ctx.batchesService.expiringSoon('owner-a', 0))).toBe('batch-invalid-window');
  });
});
