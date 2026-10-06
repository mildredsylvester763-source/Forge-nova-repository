// ============================================================================
// FILE: /apps/api/src/modules/products/entities/product.entity.ts
// ============================================================================
// The Product entity mirrors CreateProductDto field-for-field.
// Deep nested structures (specification, content, design, pricing, delivery,
// legal, analytics, automation, quality, documentation, support, timelineâ¦)
// persist as JSONB: their shape is validated by the DTOs at the boundary,
// and queryable business fields (status, pricing model, currency, revenue)
// are promoted to indexed columns for filtering and portfolio decisions.
// Zero-trust: every query is scoped by userId/accountId; ownership columns
// are never accepted from request bodies.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  VersionColumn,
  OneToMany,
  Generated,
} from 'typeorm';
import { ProductType, ProductFormat, ProductStatus } from '../enums';
import { ProductHistory } from './product-history.entity';

@Entity('products')
@Index(['userId', 'status'])
@Index(['userId', 'type'])
@Index(['userId', 'updatedAt'])
@Index(['userId', 'pricingModel'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Ownership (zero-trust scoping) ----------------------------------------
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  accountId: string;

  // Optional lineage: the opportunity that spawned this product.
  @Column({ type: 'uuid', nullable: true })
  @Index()
  opportunityId?: string;

  // --- Identity -------------------------------------------------------------
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  shortDescription?: string;

  // URL-safe unique-per-user identifier for public listings.
  @Column({ length: 255 })
  @Index
()
  slug: string;

  // --- Classification ---------------------------------------------------------
  @Column({ type: 'enum', enum: ProductType })
  type: ProductType;

  @Column({ type: 'enum', enum: ProductFormat, nullable: true })
  format?: ProductFormat;

  @Column({ type: 'jsonb', nullable: true })
  formats?: ProductFormat[];

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @Column({ type: 'jsonb', nullable: true })
  categories?: string[];

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  // --- Structure (validated deep shapes, stored as JSONB) -------------------
  @Column({ type: 'jsonb', nullable: true })
  specification?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  content?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  design?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  logo?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  branding?: Record<string, any>;

  // --- Commerce (business fields promoted to columns for querying) ---------
  @Column({ type: 'varchar', length: 32, nullable: true })
  pricingModel?: 'free' | 'one-time' | 'subscription' | 'freemium' | 'pay-what-you-want' | 'donation' | 'tiered';

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  salePrice?: number;

  @Column({ type: 'char', length: 3, nullable: true })
  currency?: string;

  @Column({ type: 'jsonb', nullable: true })
  pricing?: Record<string, any>;        // full PricingDto (subscription, tiers, costs, VAT)
  @Column({ type: 'jsonb', nullable: true })
  delivery?: Record<string, any>;       // download, physical, payment options
  @Column({ type: 'jsonb', nullable: true })
  shipping?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  fulfillment?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  serviceDelivery?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  apiDelivery?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  distributionChannels?: Record<string, any>[];

  // --- Growth & market -------------------------------------------------------
  @Column({ type: 'jsonb', nullable: true })
  marketing?: Record<string, any>;      // seo, content, social posts, ads
  @Column({ type: 'jsonb', nullable: true })
  salesData?: Record<string, any>;     // funnel, metrics, affiliates

  // Portfolio decision metrics - denormalized for the kill/scale/pivot engine.
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  revenue: number;

  @Column({ type: 'int', default: 0 })
  orders: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  averageOrderValue: number;

  // --- Legal ----------------------------------------------------------------
  @Column({ type: 'jsonb', nullable: true })
  legal?: Record<string, any>;         // terms, privacy, refunds, licenses,
                                       // compliance (GDPR/CCPA/â¦), IP, trademark

  // --- Versions & collaboration ---------------------------------------------
  @Column({ type: 'jsonb', nullable: true })
  versions?: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  team?: Record<string, any>[];

  // --- Intelligence & autonomy ----------------------------------------------
  @Column({ type: 'jsonb', nullable: true })
  analytics?: Record<string, any>;      // usage, engagement, conversion, revenue,
                                       // retention, technical, insights
  @Column({ type: 'jsonb', nullable: true })
  automation?: Record<string, any>;    // workflows, AI agents, triggers
  @Column({ type: 'jsonb', nullable: true })
  productGeneration?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  contentGeneration?: Record<string
, any>;
  @Column({ type: 'jsonb', nullable: true })
  marketingAutomation?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  customerSupport?: Record<string, any>;

  // --- Quality & docs -------------------------------------------------------
  @Column({ type: 'jsonb', nullable: true })
  testing?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  quality?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  testingCompliance?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  documentation?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  faqs?: Record<string, any>[];
  @Column({ type: 'jsonb', nullable: true })
  tutorials?: Record<string, any>[];
  @Column({ type: 'jsonb', nullable: true })
  changelogEntries?: Record<string, any>[];
  @Column({ type: 'jsonb', nullable: true })
  support?: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true })
  timeline?: Record<string, any>[];

  // --- Free-form extension (never trusted; validated shape at boundary) ----
  @Column({ type: 'jsonb', nullable: true })
  workflow?: Record<string, any>;      // { currentStep, totalSteps, completedSteps }
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // --- Relations --------------------------------------------------------------
  @OneToMany(() => ProductHistory, (h) => h.product)
  histories: ProductHistory[];

  // --- Lifecycle ------------------------------------------------------------
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  retiredAt?: Date;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
