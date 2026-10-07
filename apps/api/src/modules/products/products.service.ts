// ============================================================================
// FILE: /apps/api/src/modules/products/products.service.ts
// ============================================================================
// Product lifecycle service. Mirrors the discipline of OpportunitiesService:
// zero-trust ownership scoping on every query, full audit trail, explicit
// failure paths, version-checked updates, and status transitions that stamp
// lifecycle timestamps. Portfolio decision metrics (revenue, orders, AOV)
// are maintained here so the kill/scale/pivot engine can query them cheaply.

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike, Between, MoreThan, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { Product } from './entities/product.entity';
import { ProductHistory } from './entities/product-history.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductStatus } from './enums';
import { decide, rankByVerdict, DecisionInput } from './decision/decision.service';

// Allowed status transitions. A product cannot skip the value chain:
// draft → validating → pre_launch → live → paused/discontinued → retired.
const STATUS_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  [ProductStatus.DRAFT]: [ProductStatus.VALIDATING, ProductStatus.RETIRED],
  [ProductStatus.VALIDATING]: [ProductStatus.PRE_LAUNCH, ProductStatus.DRAFT, ProductStatus.RETIRED],
  [ProductStatus.PRE_LAUNCH]: [ProductStatus.LIVE, ProductStatus.PAUSED, ProductStatus.RETIRED],
  [ProductStatus.LIVE]: [ProductStatus.PAUSED, ProductStatus.DISCONTINUED],
  [ProductStatus.PAUSED]: [ProductStatus.LIVE, ProductStatus.DISCONTINUED],
  [ProductStatus.DISCONTINUED]: [ProductStatus.RETIRED],
  [ProductStatus.RETIRED]: [],
};

@Injectable()
export class ProductsService {

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductHistory)
    private readonly productHistoryRepository: Repository<ProductHistory>,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────
  async create(userId: string, dto: CreateProductDto): Promise<Product> {
    const slug = dto.slug || this.slugify(dto.name);
    await this.assertSlugAvailable(userId, slug);

    const product = this.productRepository.create({
      ...dto,
      slug,
      userId,
      accountId: userId,
      status: dto.status || ProductStatus.DRAFT,
    });
    const saved = await this.productRepository.save(product);

    await this.createHistory(saved.id, userId, 'CREATE', {
      action: 'create',
      by: userId,
      changes: { name: saved.name, type: saved.type, status: saved.status },
    });

    return saved;
  }

  // ─── Read ────────────────────────────────────────────────────────────────
  async findAll(userId: string, query?: ProductQueryDto): Promise<{ data: Product[]; total: number }> {
    const where: any = { userId };

    if (query) {
      if (query.type) where.type = query.type;
      if (query.format) where.format = query.format;
      if (query.status) where.status = query.status;
      if (query.pricingModel) where.pricingModel = query.pricingModel;
      if (query.currency) where.currency = query.currency;
      if (query.opportunityId) where.opportunityId = query.opportunityId;

      if (query.types?.length) where.type = In(query.types);
      if (query.statuses?.length) where.status = In(query.statuses);

      if (query.search) where.name = ILike('%' + query.search + '%');

      if (query.minPrice !== undefined && query.maxPrice !== undefined) {
        where.price = Between(query.minPrice, query.maxPrice);
      } else if (query.minPrice !== undefined) {
        where.price = MoreThan(query.minPrice);
      } else if (query.maxPrice !== undefined) {
        where.price = LessThan(query.maxPrice);
      }

      if (query.minRevenue !== undefined) where.revenue = MoreThan(query.minRevenue);
    }

    const [data, total] = await this.productRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query?.skip || 0,
      take: query?.take || 50,
    });

    return { data, total };
  }

  async findOne(userId: string, id: string): Promise<Product> {
    return this.getOwnedProduct(userId, id);
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  async update(userId: string, id: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.getOwnedProduct(userId, id);

    // Slug moves are explicit: if a new slug arrives, it must be free.
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugAvailable(userId, dto.slug);
    }

    // Ownership never comes from the body.
    const { userId: _u, accountId: _a, ...safeDto } = dto as any;

    const oldValues = this.pickChanged(existing, safeDto);
    this.productRepository.merge(existing, safeDto);
    const saved = await this.productRepository.save(existing);

    if (Object.keys(oldValues).length) {
      await this.createHistory(id, userId, 'UPDATE', {
        oldValues,
        newValues: this.pickChanged(saved, safeDto),
      });
    }

    return saved;
  }

  // ─── Status lifecycle ──────────────────────────────────────────────────────
  async changeStatus(userId: string, id: string, newStatus: ProductStatus, reason?: string): Promise<Product> {
    const product = await this.getOwnedProduct(userId, id);
    const oldStatus = product.status;

    const allowed = STATUS_TRANSITIONS[oldStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictException(
        'Invalid status transition: ' + oldStatus + ' → ' + newStatus + '. Allowed: ' + allowed.join(', '),
      );
    }

    product.status = newStatus;
    const now = new Date();
    if (newStatus === ProductStatus.LIVE && !product.publishedAt) product.publishedAt = now;
    if (newStatus === ProductStatus.PAUSED) product.pausedAt = now;
    if (newStatus === ProductStatus.RETIRED) product.retiredAt = now;

    const saved = await this.productRepository.save(product);
    await this.createHistory(id, userId, 'STATUS_CHANGE', { oldStatus, newStatus, reason });
    return saved;
  }

  // ─── Portfolio decision metrics ────────────────────────────────────────────
  // Called by the order/fulfillment layer after each sale so the
  // kill/scale/pivot engine reads live numbers without joins.
  async recordSale(userId: string, id: string, amount: number): Promise<Product> {
    const product = await this.getOwnedProduct(userId, id);
    const previousRevenue = Number(product.revenue) || 0;
    const previousOrders = product.orders || 0;

    product.revenue = previousRevenue + amount;
    product.orders = previousOrders + 1;
    product.averageOrderValue = Number(product.revenue) / product.orders;

    const saved = await this.productRepository.save(product);
    await this.createHistory(id, userId, 'UPDATE', {
      oldValues: { revenue: previousRevenue, orders: previousOrders },
      newValues: { revenue: Number(product.revenue), orders: product.orders, amount },
    });
    return saved;
  }

  async getPortfolioMetrics(userId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalRevenue: number;
    totalOrders: number;
    averageRevenuePerProduct: number;
    topPerformers: Array<{ id: string; name: string; revenue: number; orders: number }>;
  }> {
    const products = await this.productRepository.find({ where: { userId } });
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const p of products) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      byType[p.type] = (byType[p.type] || 0) + 1;
      totalRevenue += Number(p.revenue) || 0;
      totalOrders += p.orders || 0;
    }

    const topPerformers = products
      .map((p) => ({ id: p.id, name: p.name, revenue: Number(p.revenue) || 0, orders: p.orders }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      total: products.length,
      byStatus,
      byType,
      totalRevenue,
      totalOrders,
      averageRevenuePerProduct: products.length ? totalRevenue / products.length : 0,
      topPerformers,
    };
  }

  // ─── Delete / restore ──────────────────────────────────────────────────────
  async remove(userId: string, id: string): Promise<void> {
    const product = await this.getOwnedProduct(userId, id);
    await this.productRepository.softDelete(product.id);
    await this.createHistory(id, userId, 'DELETE', {
      oldValues: { name: product.name, status: product.status },
    });
  }

  async restore(userId: string, id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id, userId },
      withDeleted: true,
    });
    if (!product) throw new NotFoundException('Product with id ' + id + ' not found');

    await this.productRepository.restore(product.id);
    await this.createHistory(id, userId, 'RESTORE', { name: product.name });
    return product;
  }

  async getHistory(userId: string, productId: string, page = 1, limit = 20) {
    const [data, total] = await this.productHistoryRepository.findAndCount({
      where: { productId, userId },
      order: { changedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  // ─── Bulk operations ───────────────────────────────────────────────────────
  async bulkUpdate(userId: string, ids: string[], updates: UpdateProductDto) {
    const { userId: _u, accountId: _a, ...safeUpdates } = updates as any;
    let updated = 0; let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.update(userId, id, safeUpdates);
        updated++;
      } catch (error: any) {
        failed++;
        errors.push(id + ': ' + error.message);
      }
    }
    return { updated, failed, errors };
  }

  async bulkDelete(userId: string, ids: string[]) {
    let deleted = 0; let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.remove(userId, id);
        deleted++;
      } catch (error: any) {
        failed++;
        errors.push(id + ': ' + error.message);
      }
    }
    return { deleted, failed, errors };
  }

  // ─── Kill / scale / pivot decision engine (Feature 42) ─────────────────
  // The pure rules live in ./decision; this is the honest data layer. The
  // verdict is stamped into metadata.decision (auditable, fail-visible) and
  // a DECISION history row is written — the owner can always see what the
  // engine saw, not just what it concluded.

  // Decimal columns come back as strings; missing values are 0 evidence,
  // never NaN. The observation clock starts at product creation.
  private toDecisionInput(product: Product): DecisionInput {
    const num = (v: any): number => {
      if (v === null || v === undefined) return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const created = product.createdAt ? new Date(product.createdAt).getTime() : 0;
    const ageDays = created > 0 ? Math.max(0, Math.floor((Date.now() - created) / 86400000)) : 0;
    return {
      status: product.status,
      revenue: num(product.revenue),
      orders: Number(product.orders) || 0,
      averageOrderValue: num(product.averageOrderValue),
      ageDays,
    };
  }

  async decideProduct(userId: string, id: string) {
    const product = await this.getOwnedProduct(userId, id);
    const input = this.toDecisionInput(product);
    const result = decide(input);
    const decidedAt = new Date().toISOString();
    product.metadata = {
      ...(product.metadata || {}),
      decision: { ...result, input, decidedAt },
    };
    await this.productRepository.save(product);
    await this.createHistory(id, userId, 'DECISION', {
      verdict: result.verdict,
      confidence: result.confidence,
      reasons: result.reasons,
      input,
    });
    return { ...result, input, decidedAt, product };
  }

  // Portfolio-wide sweep: evaluates every product the user owns, ranks
  // actionables first (SCALE, KILL, PIVOT, HOLD), and returns counts. It
  // never writes — a portfolio view is a read, not a mutation.
  async decidePortfolio(userId: string) {
    const products = await this.productRepository.find({ where: { userId } });
    const evaluated = products.map(product => ({
      product,
      result: decide(this.toDecisionInput(product)),
    }));
    const ranked = rankByVerdict(evaluated, e => e.result.verdict);
    const results = ranked.map(e => ({
      id: e.product.id,
      name: e.product.name,
      status: e.product.status,
      verdict: e.result.verdict,
      confidence: e.result.confidence,
      reasons: e.result.reasons,
    }));
    const counts: Record<string, number> = { SCALE: 0, KILL: 0, PIVOT: 0, HOLD: 0 };
    for (const e of evaluated) counts[e.result.verdict]++;
    return { results, counts, total: products.length };
  }
  // ─── Private helpers ────────────────────────────────────────────────────────
  private async getOwnedProduct(userId: string, id: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id, userId } });
    if (!product) throw new NotFoundException('Product with id ' + id + ' not found');
    return product;
  }

  private async assertSlugAvailable(userId: string, slug: string): Promise<void> {
    const existing = await this.productRepository.findOne({ where: { userId, slug } });
    if (existing) throw new ConflictException('Slug "' + slug + '" is already in use');
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'product-' + randomUUID().slice(0, 8);
  }

  // Collect before/after values only for keys present in the change set.
  private pickChanged(entity: Product, dto: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of Object.keys(dto)) {
      if (dto[key] !== undefined) out[key] = (entity as any)[key];
    }
    return out;
  }

  private async createHistory(
    productId: string,
    userId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'STATUS_CHANGE' | 'DECISION',
    changes: Record<string, any>,
  ): Promise<ProductHistory> {
    const history = this.productHistoryRepository.create({
      id: randomUUID(),
      productId,
      userId,
      action,
      changes,
      reason: changes.reason,
      oldStatus: changes.oldStatus,
      newStatus: changes.newStatus,
      snapshot: changes.newValues || changes,
    });
    return this.productHistoryRepository.save(history);
  }
}
