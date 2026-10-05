// ============================================================================
// FILE: /apps/api/src/modules/opportunities/entities/opportunity.entity.ts
// ============================================================================

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import {
  OpportunityCategory,
  OpportunitySource,
  OpportunityStatus,
  OpportunityPriority,
  RiskLevel,
} from '../enums';

@Entity('opportunities')
@Index(['userId', 'status'])
@Index(['userId', 'category'])
@Index(['userId', 'priority'])
@Index(['userId', 'riskLevel'])
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Ownership (zero-trust: every query is scoped by these) ───────────────
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  accountId: string;

  // ─── Identity ────────────────────────────────────────────────────────────
  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // ─── Classification ──────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: OpportunityCategory })
  category: OpportunityCategory;

  @Column({ type: 'enum', enum: OpportunitySource })
  source: OpportunitySource;

  @Column({ type: 'enum', enum: OpportunityStatus, default: OpportunityStatus.NEW })
  status: OpportunityStatus;

  @Column({ type: 'enum', enum: OpportunityPriority, default: OpportunityPriority.MEDIUM })
  priority: OpportunityPriority;

  @Column({ type: 'enum', enum: RiskLevel, default: RiskLevel.LOW })
  riskLevel: RiskLevel;

  // ─── Scoring (cross-category opportunity score, 0–100) ───────────────────
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  score: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  confidence: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  estimatedMarketSize: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  estimatedMonthlyRevenue: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  competitionIntensity: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  priceElasticity: number;

  // ─── Context (validated by CreateOpportunityDto) ──────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  targetAudience?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  competitors?: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  trendData?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  geographicDemand?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  seasonalPatterns?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  regulatoryFlags?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  @Column({ type: 'timestamptz', nullable: true })
  lastScannedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  nextScanAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
