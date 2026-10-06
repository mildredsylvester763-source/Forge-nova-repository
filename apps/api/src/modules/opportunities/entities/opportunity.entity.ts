// ============================================================================
// FILE: /apps/api/src/modules/opportunities/entities/opportunity.entity.ts
// ============================================================================
// Matches every field the OpportunitiesService reads or writes.
// Zero-trust: all queries scope by userId; ownership never comes from bodies.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  VersionColumn,
  OneToMany,
} from 'typeorm';
import { OpportunityHistory } from './opportunity-history.entity';
import { OpportunityScan } from './opportunity-scan.entity';
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
@Index(['userId', 'externalId', 'source'])   // upsert key for scanned signalsexport class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Ownership (zero-trust scoping) ----------------------------------------
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  accountId: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string;

  // --- Identity --------------------------------------------------------------
  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // --- External provenance (scanner upsert key) -----------------------------
  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId?: string;

  @Column({ type: 'text', nullable: true })
  externalUrl?: string;

  // --- Classification ---------------------------------------------------------
  @Column({ type: 'enum', enum: OpportunityCategory })
  category: OpportunityCategory;

  @Column({ type: 'enum', enum: OpportunitySource })
  source: OpportunitySource;

  @Column({ type: 'enum', enum: OpportunityStatus, default: OpportunityStatus.DISCOVERED })
  status: OpportunityStatus;

  @Column({ type: 'enum', enum: OpportunityPriority, default: OpportunityPriority.MEDIUM })
  priority: OpportunityPriority;

  @Column({ type: 'enum', enum: RiskLevel, default: RiskLevel.LOW })
  riskLevel: RiskLevel;

  // --- Composite score (0â100) and sub-scores (0â10, set by scoring agents) --
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  score: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  demandScore?: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 5 })
  competitionScore?: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  profitabilityScore?: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  feasibilityScore?: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  trendScore?: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  seasonalityScore?: number;

  // --- Context (validated by CreateOpportunityDto) ---------------------------
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
  tags?: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // --- Collaboration & triage ------------------------------------------------
  @Column({ type: 'boolean', default: false })
  isFavorite: boolean;

  @Column({ type: 'jsonb', nullable: true })
  watchers?: string[];

  // --- Lifecycle timestamps (set by changeStatus) -----------------------------
  @Column({ type: 'timestamptz', nullable: true })
  discoveredAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  launchedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  killedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  retiredAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastScannedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  nextScanAt?: Date;

  // --- Relations --------------------------------------------------------------
  @OneToMany(() => OpportunityHistory, (h) => h.opportunity)
  histories: OpportunityHistory[];

  @OneToMany(() => OpportunityScan, (s) => s.opportunity)
  scans: OpportunityScan[];

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
