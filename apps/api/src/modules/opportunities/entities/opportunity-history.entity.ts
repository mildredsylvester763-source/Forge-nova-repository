// ============================================================================
// FILE: /apps/api/src/modules/opportunities/entities/opportunity-history.entity.ts
// ============================================================================
// Immutable audit trail. Every mutation of an opportunity is recorded here.
// Append-only by convention: services never update or delete history rows.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OpportunityHistoryAction } from '../enums';

@Entity('opportunity_history')
@Index(['opportunityId', 'createdAt'])
@Index(['userId', 'createdAt'])
export class OpportunityHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  opportunityId: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'enum', enum: OpportunityHistoryAction })
  action: OpportunityHistoryAction;

  @Column({ type: 'text', nullable: true })
  note?: string;

  // Full change payload (before/after values) — audit-grade evidence.
  @Column({ type: 'jsonb', nullable: true })
  changes?: Record<string, any>;

  // Actor: user id or agent id (autonomous decisions are attributed too).
  @Column({ type: 'uuid' })
  by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
