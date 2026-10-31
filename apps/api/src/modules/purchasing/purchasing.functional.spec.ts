import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { Supplier } from './entities/supplier.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';

// Multi-user scenarios for supplier records and purchase orders: two owners,
// name uniqueness, sequential PO numbers, the full lifecycle, partial and
// full receipts pushing REAL stock movements, refusals with zero side
// effects, and per-owner isolation. Real services on the shared fake
// repositories.

function build() {
  const suppliers = fakeRepo<Supplier>();
  const orders = fakeRepo<PurchaseOrder>();
  const lines = fakeRepo<PurchaseOrderLine>();
  const items = fakeRepo<StockItem>();
  const movements = fakeRepo<StockMovement>();
  const suppliersService = new SuppliersService(suppliers.repo);
  const purchaseOrdersService = new PurchaseOrdersService(
    suppliers.repo,
    orders.repo,
    lines.repo,
    items.repo,
    movements.repo,
  );
  return {
    suppliersService,
    purchaseOrdersService,
    supplierRows: suppliers.rows,
    orderRows: orders.rows,
    lineRows: lines.rows,
    itemRows: items.rows,
    movementRows: movements.rows,
  };
}

async function seedItem(ctx: ReturnType<typeof build>, userId: string, sku: string, onHand: number) {
  ctx.itemRows.push({
    userId,
    sku,
    name: sku,
    onHand,
    createdAt: new Date(),
  } as StockItem);
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

describe('purchasing functional scenarios', () => {
  it('lets two owners use the same supplier name independently', async () => {
    const ctx = build();
    await ctx.suppliersService.create('owner-a', { name: 'Acme Ltd' });
    await ctx.suppliersService.create('owner-b', { name: 'Acme Ltd' });
    const listA = await ctx.suppliersService.list('owner-a');
    const listB = await ctx.suppliersService.list('owner-b');
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0].name).toBe('Acme Ltd');
  });

  it('refuses a duplicate supplier name for one owner and records nothing', async () => {
    const ctx = build();
    await ctx.suppliersService.create('owner-a', { name: 'Acme Ltd' });
    const before = ctx.supplierRows.length;
    const reason = await refusal(ctx.suppliersService.create('owner-a', { name: 'acme ltd' }));
    expect(reason).toBe('supplier-name-exists');
    expect(ctx.supplierRows).toHaveLength(before);
  });

  it('refuses broken supplier inputs by name with zero side effects', async () => {
    const ctx = build();
    expect(await refusal(ctx.suppliersService.create('owner-a', { name: 'X', email: 'nope' }))).toBe(
      'supplier-invalid-email',
    );
    expect(await refusal(ctx.suppliersService.create('owner-a', { name: 'X', leadTimeDays: 400 }))).toBe(
      'supplier-invalid-lead-time',
    );
    expect(await refusal(ctx.suppliersService.create('owner-a', { name: '   ' }))).toBe(
      'supplier-invalid-name',
    );
    expect(ctx.supplierRows).toHaveLength(0);
  });

  it('creates drafts with sequential numbers, exact totals and a lead-time expected date', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await seedItem(ctx, 'owner-a', 'SKU-2', 5);
    await ctx.suppliersService.create('owner-a', { name: 'Acme', leadTimeDays: 7 });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po1 = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [
        { sku: 'SKU-1', qty: 5, unitCostCents: 200 },
        { sku: 'SKU-2', qty: 3, unitCostCents: 100 },
      ],
    });
    expect(po1.poNumber).toBe(1);
    expect(po1.totalCents).toBe(1300);
    expect(po1.status).toBe('draft');
    expect(po1.expectedAt instanceof Date).toBe(true);
    const po2 = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [{ sku: 'SKU-1', qty: 1, unitCostCents: 50 }],
    });
    expect(po2.poNumber).toBe(2);
  });

  it('refuses drafts for unknown suppliers or SKUs and records nothing', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    expect(
      await refusal(
        ctx.purchaseOrdersService.createDraft('owner-a', {
          supplierId: 'nope',
          lines: [{ sku: 'SKU-1', qty: 1, unitCostCents: 0 }],
        }),
      ),
    ).toBe('supplier-not-found');
    const before = ctx.orderRows.length;
    expect(
      await refusal(
        ctx.purchaseOrdersService.createDraft('owner-a', {
          supplierId: supplier.id,
          lines: [{ sku: 'GHOST', qty: 1, unitCostCents: 0 }],
        }),
      ),
    ).toBe('po-unknown-sku:GHOST');
    expect(ctx.orderRows).toHaveLength(before);
  });

  it('refuses duplicate SKU lines in one order', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    expect(
      await refusal(
        ctx.purchaseOrdersService.createDraft('owner-a', {
          supplierId: supplier.id,
          lines: [
            { sku: 'SKU-1', qty: 1, unitCostCents: 0 },
            { sku: ' SKU-1 ', qty: 2, unitCostCents: 0 },
          ],
        }),
      ),
    ).toBe('po-duplicate-sku');
    expect(ctx.orderRows).toHaveLength(0);
  });

  it('sends a draft once and refuses a double send', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [{ sku: 'SKU-1', qty: 5, unitCostCents: 0 }],
    });
    const sent = await ctx.purchaseOrdersService.send('owner-a', po.id);
    expect(sent.status).toBe('sent');
    expect(await refusal(ctx.purchaseOrdersService.send('owner-a', po.id))).toBe(
      'po-invalid-transition',
    );
  });

  it('refuses to receive on a draft or cancelled order and moves no stock', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const draft = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [{ sku: 'SKU-1', qty: 5, unitCostCents: 0 }],
    });
    expect(
      await refusal(ctx.purchaseOrdersService.receive('owner-a', draft.id, { sku: 'SKU-1', qty: 1 })),
    ).toBe('po-status-not-receivable');
    const cancelled = await ctx.purchaseOrdersService.cancel('owner-a', draft.id);
    expect(cancelled.status).toBe('cancelled');
    expect(
      await refusal(ctx.purchaseOrdersService.receive('owner-a', draft.id, { sku: 'SKU-1', qty: 1 })),
    ).toBe('po-cancelled');
    expect(ctx.movementRows).toHaveLength(0);
    expect(ctx.itemRows[0].onHand).toBe(10);
  });

  it('receives partially: real stock rises, the movement cites the order', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await seedItem(ctx, 'owner-a', 'SKU-2', 5);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [
        { sku: 'SKU-1', qty: 5, unitCostCents: 0 },
        { sku: 'SKU-2', qty: 3, unitCostCents: 0 },
      ],
    });
    await ctx.purchaseOrdersService.send('owner-a', po.id);
    const result = await ctx.purchaseOrdersService.receive('owner-a', po.id, {
      sku: 'SKU-1',
      qty: 3,
    });
    expect(result.status).toBe('partially-received');
    expect(result.newOnHand).toBe(13);
    expect(ctx.movementRows).toHaveLength(1);
    expect(ctx.movementRows[0].note).toBe('purchase-order:' + po.id);
    const sku1Row = ctx.itemRows.find((r) => r.sku === 'SKU-1');
    if (!sku1Row) throw new Error('expected SKU-1 stock row');
    expect(sku1Row.onHand).toBe(13);
  });

  it('refuses an over-receipt and leaves stock untouched', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [{ sku: 'SKU-1', qty: 5, unitCostCents: 0 }],
    });
    await ctx.purchaseOrdersService.send('owner-a', po.id);
    await ctx.purchaseOrdersService.receive('owner-a', po.id, { sku: 'SKU-1', qty: 3 });
    const before = ctx.movementRows.length;
    expect(
      await refusal(ctx.purchaseOrdersService.receive('owner-a', po.id, { sku: 'SKU-1', qty: 3 })),
    ).toBe('po-over-receive');
    expect(ctx.movementRows).toHaveLength(before);
    expect(ctx.itemRows[0].onHand).toBe(13);
  });

  it('keeps a fully received line open on the order and refuses re-receiving it', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await seedItem(ctx, 'owner-a', 'SKU-2', 5);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [
        { sku: 'SKU-1', qty: 5, unitCostCents: 0 },
        { sku: 'SKU-2', qty: 3, unitCostCents: 0 },
      ],
    });
    await ctx.purchaseOrdersService.send('owner-a', po.id);
    const result = await ctx.purchaseOrdersService.receive('owner-a', po.id, {
      sku: 'SKU-1',
      qty: 5,
    });
    expect(result.status).toBe('partially-received');
    expect(
      await refusal(ctx.purchaseOrdersService.receive('owner-a', po.id, { sku: 'SKU-1', qty: 1 })),
    ).toBe('po-already-received');
  });

  it('marks the order received only when every line is full, and blocks cancellation', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await seedItem(ctx, 'owner-a', 'SKU-2', 5);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [
        { sku: 'SKU-1', qty: 5, unitCostCents: 0 },
        { sku: 'SKU-2', qty: 3, unitCostCents: 0 },
      ],
    });
    await ctx.purchaseOrdersService.send('owner-a', po.id);
    await ctx.purchaseOrdersService.receive('owner-a', po.id, { sku: 'SKU-1', qty: 5 });
    expect(await refusal(ctx.purchaseOrdersService.cancel('owner-a', po.id))).toBe(
      'po-cancel-after-receipt',
    );
    const done = await ctx.purchaseOrdersService.receive('owner-a', po.id, { sku: 'SKU-2', qty: 3 });
    expect(done.status).toBe('received');
    expect(await refusal(ctx.purchaseOrdersService.cancel('owner-a', po.id))).toBe(
      'po-invalid-transition',
    );
    expect(
      await refusal(ctx.purchaseOrdersService.receive('owner-a', po.id, { sku: 'SKU-2', qty: 1 })),
    ).toBe('po-status-not-receivable');
  });

  it('cancels a clean sent order but never one with receipts', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-2', 5);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [{ sku: 'SKU-2', qty: 2, unitCostCents: 0 }],
    });
    await ctx.purchaseOrdersService.send('owner-a', po.id);
    const cancelled = await ctx.purchaseOrdersService.cancel('owner-a', po.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('keeps purchase orders invisible across owners', async () => {
    const ctx = build();
    await seedItem(ctx, 'owner-a', 'SKU-1', 10);
    await ctx.suppliersService.create('owner-a', { name: 'Acme' });
    const supplier = (await ctx.suppliersService.list('owner-a'))[0];
    const po = await ctx.purchaseOrdersService.createDraft('owner-a', {
      supplierId: supplier.id,
      lines: [{ sku: 'SKU-1', qty: 5, unitCostCents: 0 }],
    });
    await ctx.purchaseOrdersService.send('owner-a', po.id);
    expect(
      await refusal(ctx.purchaseOrdersService.receive('owner-b', po.id, { sku: 'SKU-1', qty: 1 })),
    ).toBe('purchase-order-not-found');
    const listB = await ctx.purchaseOrdersService.list('owner-b');
    expect(listB).toHaveLength(0);
    const listA = await ctx.purchaseOrdersService.list('owner-a');
    expect(listA).toHaveLength(1);
  });
});
