// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/experiment-subject.entity.ts
// ============================================================================
// One row per (experiment, subject) — the deterministic assignment AND its
// at-most-one outcome (FORGE AI-029). success = null means assigned but not
// yet converted; success set means the outcome was recorded exactly once
// (the service refuses double-taps by name). Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('product_experiment_subjects')
@Index(['userId', 'experimentId', 'subjectUserId'], { unique: true })
@Index(['userId', 'experimentId'])
export class ProductExperimentSubject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Experiment owner (zero-trust scope). */
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  experimentId: string;

  /** The end user placed into an arm. */
  @Column({ type: 'uuid' })
  subjectUserId: string;

  @Column({ type: 'varchar', length: 64 })
  variantId: string;

  /** null = assigned, no outcome yet; set = outcome recorded exactly once. */
  @Column({ type: 'boolean', nullable: true })
  success: boolean | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
