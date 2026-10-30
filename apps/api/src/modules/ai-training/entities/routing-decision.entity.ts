// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/routing-decision.entity.ts
// ============================================================================
// One row per model-routing decision (FORGE AI-039) — the append-only
// cascade log: which model answered first, what the escalation chain was,
// what the worst case would have cost, and whether the cost cap truncated
// the chain. Every route is recorded; nothing is silently retried or
// silently capped. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RoutePlan } from '../engine/model-serving-engine';

@Entity('routing_decisions')
@Index(['userId', 'primary'])
export class RoutingDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'integer' })
  promptTokens: number;

  @Column({ type: 'varchar', length: 64 })
  primary: string;

  /** Frozen engine verdict: chain, costs, truncatedByCap, threshold. */
  @Column({ type: 'jsonb' })
  plan: RoutePlan;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
