// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/agent-event.entity.ts
// ============================================================================
// Append-only event log per AI agent (FORGE AI-030). Scorecards are COMPUTED
// from events — never stored as a mutable row — so a scorecard can always be
// rebuilt from raw history and can never drift from it. reverted/approved
// are optional flags: an approval rate counts only events where a decision
// exists. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_events')
@Index(['userId', 'agentId'])
export class ProductAgentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  agentId: string;

  @Column({ type: 'varchar', length: 16 })
  outcome: 'success' | 'failure';

  @Column({ type: 'boolean', nullable: true })
  reverted: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  approved: boolean | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
