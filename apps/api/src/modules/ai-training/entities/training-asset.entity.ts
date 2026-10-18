// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/training-asset.entity.ts
// ============================================================================
// One row per uploaded training asset (FORGE AI-001..004): a real image, a
// stroke recording, a sketch, a finished work, a correction pair, or a
// rating. The record enters ONLY after passing the classification gate and
// the scrub engine; the scrub evidence (findings by kind) is stored with it
// so eligibility is auditable forever. Soft-deleted: user data is never
// silently destroyed (AI-140: deletion carries into future datasets).

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum TrainingAssetKind {
  IMAGE = 'image',
  STROKE_RECORDING = 'stroke-recording',
  SKETCH = 'sketch',
  FINISHED_WORK = 'finished-work',
  CORRECTION_PAIR = 'correction-pair',
  RATING = 'rating',
}

export enum TrainingClassification {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Entity('training_assets')
@Index(['userId', 'kind'])
@Index(['userId', 'eligible'])
export class TrainingAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: TrainingAssetKind })
  kind: TrainingAssetKind;

  @Column({ type: 'enum', enum: TrainingClassification })
  classification: TrainingClassification;

  /** Hard gate (AI-002): nothing enters training without recorded consent. */
  @Column({ type: 'boolean', default: false })
  consent: boolean;

  /** Human-labeled quality 0-100. Never invented by the system. */
  @Column({ type: 'int', default: 0 })
  quality: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** Post-scrub descriptive text (PII/secrets destroyed, AI-004). */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Pointer to the binary payload in storage (never inline bytes). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  storageKey: string | null;

  /** Scrub evidence: [{ kind, count }] — eligibility is auditable forever. */
  @Column({ type: 'jsonb', nullable: true })
  scrubFindings: Record<string, any>[] | null;

  /** Total redactions applied when the asset was admitted. */
  @Column({ type: 'int', default: 0 })
  scrubRedactions: number;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  /** True once classification + consent + scrub gates all passed. */
  @Column({ type: 'boolean', default: false })
  eligible: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;
}
