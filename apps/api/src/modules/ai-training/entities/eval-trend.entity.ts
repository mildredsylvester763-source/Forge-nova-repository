// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/eval-trend.entity.ts
// ============================================================================
// One row per (metric, bucket) eval sample (FORGE AI-031). Buckets are opaque
// ascending-sortable keys (ISO dates sort correctly). The unique index makes
// history append-only: recording the same bucket twice with the same score
// is idempotent, a conflicting score is refused by name — history is never
// silently rewritten. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('eval_trend_samples')
@Index(['userId', 'metricId', 'bucket'], { unique: true })
@Index(['userId', 'metricId'])
export class EvalTrendSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  metricId: string;

  @Column({ type: 'varchar', length: 64 })
  bucket: string;

  /** Eval scores are 0..1 by law; the engine refuses anything else. */
  @Column({ type: 'double precision' })
  score: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
