// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/rollback-event.entity.ts
// ============================================================================
// One instant rollback (FORGE AI-044): the frozen pointer-flip from one
// served version to a previously-served one. The engine refused unknown
// targets, no-ops and unserved currents BEFORE this row exists; the served
// history is never rewritten — rolling forward again is a new promotion.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RollbackPlan } from '../engine/model-operations-engine';

@Entity('rollback_events')
@Index(['userId', 'modelId'])
export class RollbackEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Frozen engine verdict: fromVersion, toVersion, fingerprint, history. */
  @Column({ type: 'jsonb' })
  plan: RollbackPlan;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
