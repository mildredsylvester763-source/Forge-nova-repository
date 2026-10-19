// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/training-run.entity.ts
// ============================================================================
// One row per training run (FORGE AI-013/014/017/018/019/020). A run is
// created against a frozen dataset snapshot, carries a deterministic plan
// (epochs, batch size, steps, estimated cost) and a reproducibility
// fingerprint pinning dataset + code + seed + environment + hyperparams.
// The state machine (planned/running/paused/terminal) is engine-enforced;
// cost events are charged against the run's hard budget cap; metric points
// are validated step-ordered series. Zero-trust: every row is scoped to its
// owner.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('training_runs')
@Index(['userId', 'state'])
@Index(['userId', 'createdAt'])
export class TrainingRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** The frozen dataset snapshot this run trains on. */
  @Column({ type: 'uuid' })
  datasetId: string;

  @Column({ type: 'int' })
  datasetVersion: number;

  @Column({ type: 'varchar', length: 32 })
  datasetFingerprint: string;

  /** Engine state machine: planned|running|paused|succeeded|failed|canceled. */
  @Column({ type: 'varchar', length: 16 })
  state: string;

  /** Engine-computed plan: epochs, batchSize, steps, estimatedCost. */
  @Column({ type: 'jsonb' })
  plan: {
    epochs: number;
    batchSize: number;
    steps: number;
    estimatedCost: number;
  };

  /** Hard budget cap in credit units (AI-019). */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  budget: number;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  spent: number;

  /** Chronological cost entries, engine-validated. */
  @Column({ type: 'jsonb', default: [] })
  costEntries: { step: number; units: number; at: string | null }[];

  /** Latest checkpoint for pause/resume (AI-014). */
  @Column({ type: 'jsonb', nullable: true })
  checkpoint: { step: number; sequence: number; loss: number; savedAt: string } | null;

  /** Step-ordered metric series (AI-018). */
  @Column({ type: 'jsonb', default: [] })
  metrics: { step: number; loss: number; evalScore?: number }[];

  /** Reproducibility pins (AI-020). */
  @Column({ type: 'varchar', length: 32 })
  runFingerprint: string;

  @Column({ type: 'varchar', length: 128 })
  codeVersion: string;

  @Column({ type: 'int' })
  seed: number;

  @Column({ type: 'varchar', length: 128 })
  environment: string;

  @Column({ type: 'jsonb', nullable: true })
  hyperparams: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
