// ============================================================================
// FILE: /apps/api/src/modules/opportunities/entities/opportunity-scan.entity.ts
// ============================================================================
// One row per multi-source scan run. Tracks which sources were queried,
// what was found, and what the scan produced — the raw feed of the
// continuous opportunity scanner.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OpportunityCategory, OpportunitySource, ScanStatus } from '../enums';

@Entity('opportunity_scans')
@Index(['userId', 'status'])
@Index(['userId', 'createdAt'])
export class OpportunityScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  accountId: string;

  // The opportunity this scan is attached to (null for broad portfolio scans).
  @Column({ type: 'uuid', nullable: true })
  @Index()
  opportunityId?: string;

  @Column({ type: 'enum', enum: ScanStatus, default: ScanStatus.PENDING })
  status: ScanStatus;

  // Categories and sources requested for this scan.
  @Column({ type: 'jsonb', nullable: true })
  categories?: OpportunityCategory[];

  @Column({ type: 'jsonb', nullable: true })
  sources?: OpportunitySource[];

  // Per-source results: { source, status, found, latencyMs, error }.
  @Column({ type: 'jsonb', nullable: true })
  sourceResults?: Record<string, any>[];

  @Column({ type: 'int', default: 0 })
  signalsFound: number;

  @Column({ type: 'int', default: 0 })
  opportunitiesCreated: number;

  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
