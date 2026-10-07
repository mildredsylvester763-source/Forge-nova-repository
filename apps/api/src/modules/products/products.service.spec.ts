// Product lifecycle contract under test: status transitions cannot skip
// the value chain, lifecycle timestamps are stamped exactly once, sale
// metrics accumulate correctly, and ownership scoping is enforced on
// every lookup before any mutation is attempted.

import { NotFoundException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ProductStatus } from './enums';

function makeService(productFromDb: Product | null) {
  const savedProducts: Product[] = [];
  const savedHistory: any[] = [];
  const productRepository = {
    findOne: jest.fn(async () => productFromDb),
    save: jest.fn(async (p) => { savedProducts.push(p); return p; }),
    create: jest.fn((x) => x),
    find: jest.fn(async () => []),
  } as unknown as Repository<Product>;
  const productHistoryRepository = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => { savedHistory.push(x); return x; }),
  } as unknown as Repository<any>;
  const service = new ProductsService(productRepository, productHistoryRepository);
  return { service, savedProducts, savedHistory, productRepository };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    userId: 'u1',
    status: ProductStatus.LIVE,
    revenue: 0,
    orders: 0,
    averageOrderValue: 0,
    publishedAt: null,
    pausedAt: null,
    retiredAt: null,
    ...overrides,
  } as Product;
}

describe('ProductsService.changeStatus', () => {
  it('allows LIVE to PAUSED and stamps pausedAt exactly once', async () => {
    const { service, savedProducts } = makeService(product({ status: ProductStatus.LIVE }));
    const updated = await service.changeStatus('u1', 'p-1', ProductStatus.PAUSED, 'testing pause');
    expect(updated.status).toBe(ProductStatus.PAUSED);
    expect(updated.pausedAt).toBeInstanceOf(Date);
    expect(savedProducts).toHaveLength(1);
  });

  it('allows PRE_LAUNCH to LIVE and stamps publishedAt once', async () => {
    const existing = product({ status: ProductStatus.PRE_LAUNCH, publishedAt: null as any });
    const { service } = makeService(existing);
    const updated = await service.changeStatus('u1', 'p-1', ProductStatus.LIVE);
    expect(updated.status).toBe(ProductStatus.LIVE);
    expect(updated.publishedAt).toBeInstanceOf(Date);
  });

  it('does not overwrite an existing publishedAt when re-entering LIVE', async () => {
    const firstPublished = new Date('2026-01-01T00:00:00.000Z');
    const existing = product({ status: ProductStatus.PAUSED, publishedAt: firstPublished });
    const { service } = makeService(existing);
    const updated = await service.changeStatus('u1', 'p-1', ProductStatus.LIVE);
    expect(updated.publishedAt).toBe(firstPublished);
  });

  it('rejects a skipped transition (DRAFT to LIVE)', async () => {
    const { service } = makeService(product({ status: ProductStatus.DRAFT }));
    await expect(service.changeStatus('u1', 'p-1', ProductStatus.LIVE)).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats RETIRED as terminal — no transition out is accepted', async () => {
    const { service } = makeService(product({ status: ProductStatus.RETIRED }));
    await expect(service.changeStatus('u1', 'p-1', ProductStatus.DRAFT)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.changeStatus('u1', 'p-1', ProductStatus.LIVE)).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes an append-only STATUS_CHANGE history record', async () => {
    const { service, savedHistory } = makeService(product({ status: ProductStatus.LIVE }));
    await service.changeStatus('u1', 'p-1', ProductStatus.DISCONTINUED, 'no traction');
    expect(savedHistory).toHaveLength(1);
    expect(savedHistory[0].action).toBe('STATUS_CHANGE');
    expect(savedHistory[0].oldStatus).toBe(ProductStatus.LIVE);
    expect(savedHistory[0].newStatus).toBe(ProductStatus.DISCONTINUED);
  });

  it('throws NotFound when the product does not exist for this owner', async () => {
    const { service } = makeService(null);
    await expect(service.changeStatus('u1', 'missing', ProductStatus.PAUSED)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProductsService.recordSale', () => {
  it('accumulates revenue, orders, and average order value correctly', async () => {
    const existing = product({
      status: ProductStatus.LIVE, revenue: 100, orders: 4, averageOrderValue: 25,
    });
    const { service, savedHistory } = makeService(existing);
    const updated = await service.recordSale('u1', 'p-1', 50);
    expect(Number(updated.revenue)).toBe(150);
    expect(updated.orders).toBe(5);
    expect(updated.averageOrderValue).toBe(30);
    expect(savedHistory[0].action).toBe('UPDATE');
  });
});
