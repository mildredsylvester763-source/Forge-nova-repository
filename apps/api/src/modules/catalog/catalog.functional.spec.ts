import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { CatalogService } from './catalog.service';
import { InventoryService } from '../inventory/inventory.service';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogVariant } from './entities/catalog-variant.entity';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { StockMovement } from '../inventory/entities/stock-movement.entity';

// Multi-user scenarios for the product catalog: variant grids with real
// auto-created stock rows, barcode assignment with checksum completion,
// per-owner barcode uniqueness, scan-to-stock lookups, and refusals with
// zero side effects. Real services on the shared fake repositories, with
// the real inventory service driving stock so the join is honest.

function build() {
  const items = fakeRepo<CatalogItem>();
  const variants = fakeRepo<CatalogVariant>();
  const stock = fakeRepo<StockItem>();
  const movements = fakeRepo<StockMovement>();
  const catalogService = new CatalogService(items.repo, variants.repo, stock.repo);
  const inventoryService = new InventoryService(stock.repo, movements.repo);
  return {
    catalogService,
    inventoryService,
    itemRows: items.rows,
    variantRows: variants.rows,
    stockRows: stock.rows,
    movementRows: movements.rows,
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

describe('catalog functional scenarios', () => {
  it('builds the full variant grid with real stock rows for two owners', async () => {
    const ctx = build();
    const made = await ctx.catalogService.createCatalogItem('owner-a', {
      name: 'Classic Tee',
      options: [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red', 'Blue'] },
      ],
      unitPriceCents: 1999,
    });
    expect(made.variants.map((v) => v.sku)).toEqual([
      'CLASSIC-TEE-S-RED',
      'CLASSIC-TEE-S-BLUE',
      'CLASSIC-TEE-M-RED',
      'CLASSIC-TEE-M-BLUE',
    ]);
    expect(ctx.stockRows).toHaveLength(4);
    expect(ctx.stockRows.every((s) => s.onHand === 0)).toBe(true);
    await ctx.catalogService.createCatalogItem('owner-b', { name: 'Classic Tee' });
    expect(ctx.itemRows).toHaveLength(2);
    expect(ctx.variantRows).toHaveLength(5);
    expect(ctx.stockRows).toHaveLength(5);
  });

  it('refuses a sku that already exists and records nothing', async () => {
    const ctx = build();
    ctx.stockRows.push({
      userId: 'owner-a',
      sku: 'WIDGET',
      name: 'Widget',
      onHand: 3,
      createdAt: new Date(),
    } as StockItem);
    const reason = await refusal(ctx.catalogService.createCatalogItem('owner-a', { name: 'Widget' }));
    expect(reason).toBe('sku-exists:WIDGET');
    expect(ctx.itemRows).toHaveLength(0);
    expect(ctx.variantRows).toHaveLength(0);
    expect(ctx.stockRows).toHaveLength(1);
  });

  it('refuses broken inputs by name with zero side effects', async () => {
    const ctx = build();
    expect(await refusal(ctx.catalogService.createCatalogItem('owner-a', { name: '   ' }))).toBe('catalog-invalid-name');
    expect(
      await refusal(
        ctx.catalogService.createCatalogItem('owner-a', {
          name: 'T',
          options: [
            { name: 'A', values: ['1', '2'] },
            { name: 'B', values: ['1', '2'] },
            { name: 'C', values: ['1', '2'] },
            { name: 'D', values: ['1', '2'] },
          ],
        }),
      ),
    ).toBe('variant-too-many-options');
    expect(
      await refusal(
        ctx.catalogService.createCatalogItem('owner-a', { name: 'T', options: [{ name: 'Size', values: ['S'] }] }),
      ),
    ).toBe('variant-too-few-values');
    expect(
      await refusal(
        ctx.catalogService.createCatalogItem('owner-a', { name: 'T', options: [{ name: 'Size', values: ['S', 's'] }] }),
      ),
    ).toBe('variant-duplicate-value');
    expect(await refusal(ctx.catalogService.createCatalogItem('owner-a', { name: 'T', unitPriceCents: -5 }))).toBe(
      'variant-invalid-price',
    );
    expect(ctx.itemRows).toHaveLength(0);
    expect(ctx.variantRows).toHaveLength(0);
    expect(ctx.stockRows).toHaveLength(0);
  });

  it('refuses oversized grids and duplicate sanitized skus', async () => {
    const ctx = build();
    expect(
      await refusal(
        ctx.catalogService.createCatalogItem('owner-a', {
          name: 'T',
          options: [
            { name: 'A', values: ['1', '2', '3', '4', '5'] },
            { name: 'B', values: ['1', '2', '3', '4', '5'] },
            { name: 'C', values: ['1', '2', '3', '4', '5'] },
          ],
        }),
      ),
    ).toBe('variant-too-many-variants');
    expect(
      await refusal(
        ctx.catalogService.createCatalogItem('owner-a', {
          name: 'T',
          options: [{ name: 'A', values: ['Red', 'red!'] }],
        }),
      ),
    ).toBe('variant-duplicate-sku');
    expect(ctx.itemRows).toHaveLength(0);
    expect(ctx.variantRows).toHaveLength(0);
  });

  it('assigns barcodes with checksum completion and keeps them unique per owner', async () => {
    const ctx = build();
    const made = await ctx.catalogService.createCatalogItem('owner-a', {
      name: 'Mug',
      options: [{ name: 'Color', values: ['Red', 'Blue'] }],
    });
    const red = made.variants[0];
    const assigned = await ctx.catalogService.assignBarcode('owner-a', red.id, { barcode: '590123412345' });
    expect(assigned.barcode).toBe('5901234123457');
    const blue = made.variants[1];
    expect(await refusal(ctx.catalogService.assignBarcode('owner-a', blue.id, { barcode: '590123412345' }))).toBe(
      'barcode-exists',
    );
    expect(await refusal(ctx.catalogService.assignBarcode('owner-a', blue.id, { barcode: '5901234123457' }))).toBe(
      'barcode-exists',
    );
    expect(blue.barcode).toBeUndefined();
    const otherOwner = await ctx.catalogService.createCatalogItem('owner-b', { name: 'Mug' });
    const reused = await ctx.catalogService.assignBarcode('owner-b', otherOwner.variants[0].id, {
      barcode: '590123412345',
    });
    expect(reused.barcode).toBe('5901234123457');
  });

  it('refuses bad checksums and junk barcodes with zero side effects', async () => {
    const ctx = build();
    const made = await ctx.catalogService.createCatalogItem('owner-a', { name: 'Mug' });
    const variant = made.variants[0];
    expect(await refusal(ctx.catalogService.assignBarcode('owner-a', variant.id, { barcode: '5901234123456' }))).toBe(
      'barcode-bad-checksum',
    );
    expect(await refusal(ctx.catalogService.assignBarcode('owner-a', variant.id, { barcode: '12345' }))).toBe(
      'barcode-invalid-format',
    );
    expect(variant.barcode).toBeUndefined();
    expect(
      await refusal(ctx.catalogService.assignBarcode('owner-a', 'missing', { barcode: '5901234123457' })),
    ).toBe('catalog-variant-not-found');
    expect(ctx.variantRows).toHaveLength(1);
  });

  it('scans a barcode to the real stock row and stays isolated per owner', async () => {
    const ctx = build();
    const made = await ctx.catalogService.createCatalogItem('owner-a', {
      name: 'Mug',
      options: [{ name: 'Color', values: ['Red', 'Blue'] }],
    });
    await ctx.catalogService.assignBarcode('owner-a', made.variants[0].id, { barcode: '590123412345' });
    const stockRow = ctx.stockRows.find((s) => s.sku === 'MUG-RED');
    if (!stockRow) throw new Error('expected the MUG-RED stock row');
    await ctx.inventoryService.move('owner-a', stockRow.id, { qty: 7, note: 'opening count' });
    const scanned = await ctx.catalogService.scan('owner-a', '5901234123457');
    expect(scanned.sku).toBe('MUG-RED');
    expect(scanned.onHand).toBe(7);
    expect(scanned.unitPriceCents).toBe(0);
    const scannedBase = await ctx.catalogService.scan('owner-a', '590123412345');
    expect(scannedBase.sku).toBe('MUG-RED');
    expect(await refusal(ctx.catalogService.scan('owner-b', '5901234123457'))).toBe('barcode-not-found');
  });

  it('lists variants per item and per owner only', async () => {
    const ctx = build();
    const made = await ctx.catalogService.createCatalogItem('owner-a', {
      name: 'Shirt',
      options: [{ name: 'Size', values: ['S', 'M'] }],
    });
    const listed = await ctx.catalogService.variantsFor('owner-a', made.item.id);
    expect(listed).toHaveLength(2);
    expect(listed.map((v) => v.sku)).toEqual(['SHIRT-M', 'SHIRT-S']);
    expect(await refusal(ctx.catalogService.variantsFor('owner-b', made.item.id))).toBe('catalog-item-not-found');
  });

  it('refuses a second item whose skus collide and keeps the original intact', async () => {
    const ctx = build();
    await ctx.catalogService.createCatalogItem('owner-a', { name: 'Widget' });
    expect(await refusal(ctx.catalogService.createCatalogItem('owner-a', { name: 'Widget!' }))).toBe('sku-exists:WIDGET');
    expect(ctx.itemRows).toHaveLength(1);
    expect(ctx.variantRows).toHaveLength(1);
  });
});
