// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/mining-batch.entity.ts
// ============================================================================
// One row per mined failure batch (FORGE AI-032) — durable evidence of which
// failed cases were promoted into new training data. Content fingerprints
// dedupe repeats (the same failure is never mined twice); the cap refuses
// loudly instead of silently trimming. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MinedCase } from '../engine/product-experiment-engine';

@Entity('failure_mining_batches')
@Index(['userId', 'batchId'], { unique: true })
export class FailureMiningBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  batchId: string;

  /** Frozen engine verdict: deduped, weight-ranked, capped survivors. */
  @Column({ type: 'jsonb' })
  cases: MinedCase[];

  @Column({ type: 'integer' })
  count: number;

  @Column({ type: 'integer' })
  duplicatesDropped: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
