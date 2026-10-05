// ============================================================================
// FILE: /apps/api/src/modules/opportunities/entities/opportunity-history.entity.ts
// ============================================================================
// Immutable audit trail. Matches every field createHistory() writes.
// Append-only: no service ever updates or deletes rows here.
// Typed as string-literal unions (not TS enums) so the service's raw string
// action values assign without casts, while Postgres still enforces enums.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Opportunity } from './opportunity.entity';

export type OpportunityHistoryActionType =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
  | 'STATUS_CHANGE' | 'PRIORITY_CHANGE' | 'SCORE_CHANGE'
  | 'ACCESS' | 'KILL' | 'SCALE' | 'PIVOT' | 'ARCHIVE' | 'NOTE';

@Entity('opportunity_history')
@Index(['opportunityId', 'changedAt'])
@Index(['userId', 'changedAt'])
export class OpportunityHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  opportunityId: string;

  @ManyToOne(() => Opportunity, (o) => o.histories, { onDelete: 'cascade' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity: Opportunity;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', { length: 32 } })
  action: OpportunityHistoryActionType;

  // Full change payload (before/after) — audit-grade evidence.
  @Column({ type: 'jsonb', nullable: true })
  changes?: Record<string, any>;

  // Denormalized transition fields for fast audit queries.
  @Column({ type: 'varchar', { length: 32 }, nullable: true })
  oldStatus?: string;

  @Column({ type: 'varchar', { length: 32 }, nullable: true })
  newStatus?: string;

  @Column({ type: 'varchar', { length: 32 }, nullable: true })
  oldPriority?: string;

  @Column({ type: 'varchar', { length: 32 }, nullable: true })
  newPriority?: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  oldScore?: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  newScore?: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  // Actor attribution: 'user' when a request context exists, else 'system'
  // (autonomous agents included — every decision is attributable).
  @Column({ type: 'varchar', { length: 16 }, default: 'system' })
  source: 'user' | 'system' | 'agent';

  @Column({ type: 'varchar', { length: 64 }, nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  changedAt: Date;
}
