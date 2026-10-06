// ============================================================================
// FILE: /apps/api/src/modules/opportunities/entities/opportunity-scan.entity.ts
// ============================================================================
// One row per multi-source scan run. Matches every field runScan() and
// createScan() write. Status typed as a string-literal union so the
// service's raw assignments ('running', 'completed', 'failed') compile
// without casts while Postgres still enforces the enum at the DB level.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { OpportunityCategory, OpportunitySource } from '../enums';

export type ScanStatusType =
  | 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

@Entity('opportunity_scans')
@Index(['userId', 'status'])
@Index(['userId', 'createdAt'])
export class OpportunityScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Ownership --------------------------------------------------------------
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  accountId?: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy?: string;

  // --- Targeting --------------------------------------------------------------
  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  opportunityId?: string;

  @ManyToOne(() => Opportunity, (o) => o.scans, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity?: Opportunity;

  // Single-source scan (switch in executeScan) or multi-source batch.
  @Column({ type: 'enum', enum: OpportunitySource, nullable: true })
  source?: OpportunitySource;

  @Column({ type: 'jsonb', nullable: true })
  sources?: OpportunitySource[];

  @Column({ type: 'jsonb', nullable: true })
  categories?: OpportunityCategory[];

  // Scanner input: queries, subreddits, languages, recurrence, caps.
  @Column({ type: 'jsonb', nullable: true })
  parameters?: Record<string, any>;

  // --- Scheduling -------------------------------------------------------------
  @Column({ type: 'boolean', default: false })
  runImmediately: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt?: Date;

  @Column({ type: 'int', default: 0 })
  runCount: number;

  // --- Execution state ---------------------------------------------------------
  @Column({ type: 'enum', enum: ['pending','running','completed','partial','failed','cancelled'], default: 'pending' })
  status: ScanStatusType;

  @Column({ type: 'jsonb', nullable: true })
  statusDetails?: Record<string, any>;    // { currentStep, totalSteps, completedSteps, progress }

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  // --- Results ----------------------------------------------------------------
  @Column({ type: 'int', default: 0 })
  opportunitiesFound: number;

  @Column({ type: 'int', default: 0 })
  opportunitiesCreated: number;

  @Column({ type: 'int', default: 0 })
  opportunitiesUpdated: number;

  @Column({ type: 'jsonb', nullable: true })
  summary?: Record<string, any>;          // byCategory / bySource / byRiskLevel / top

  @Column({ type: 'jsonb', nullable: true })
  performance?: Record<string, any>;     // executionTime, opportunitiesPerSecond

  @Column({ type: 'text', nullable: true })
  error?: string;

  // --- Notifications ----------------------------------------------------------
  @Column({ type: 'jsonb', nullable: true })
  notifications?: Record<string, any>;   // { onCompletion, onFailure, ... }

  @Column({ type: 'jsonb', nullable: true })
  notificationsSent?: Record<string, any>[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
