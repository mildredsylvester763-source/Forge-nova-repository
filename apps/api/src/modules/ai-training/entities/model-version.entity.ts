// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/model-version.entity.ts
// ============================================================================
// One row per registered model version (FORGE AI-033) — the registry ledger.
// Versions are gap-free and per-model sequential (enforced in the engine and
// pinned by the unique index); a version is immutable once registered.
// Stage starts at 'experimental' and only ever moves forward via promotion
// events. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ModelLineage, ModelStage } from '../engine/model-registry-engine';

@Entity('model_versions')
@Index(['userId', 'modelId', 'version'], { unique: true })
export class ModelVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Gap-free per-model sequence: 1, 2, 3 ... enforced by the engine + index. */
  @Column({ type: 'integer' })
  version: number;

  /** experimental -> internal -> beta -> stable. Never backwards. */
  @Column({ type: 'varchar', length: 16, default: 'experimental' })
  stage: ModelStage;

  /** Sorted, unique owner list (order-independent fingerprint input). */
  @Column({ type: 'jsonb' })
  owners: string[];

  /** Provenance: dataset, eval suite, parent version, training run. */
  @Column({ type: 'jsonb' })
  lineage: ModelLineage;

  /** Fingerprint of the actual weights artifact in storage. */
  @Column({ type: 'varchar', length: 128 })
  weightsFingerprint: string;

  /** Deterministic registry fingerprint (modfp_ + djb2). */
  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
