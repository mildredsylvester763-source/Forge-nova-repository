// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/model-card.entity.ts
// ============================================================================
// One row per auto-generated model card (FORGE AI-034) — the honest public
// contract of a model version: intended use, training lineage, eval evidence,
// limitations, and named caveats (missing safety evidence is a CAVEAT, never
// hidden). One card per model version, immutable once written. Zero-trust
// scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ModelCard as ModelCardContent } from '../engine/model-registry-engine';

@Entity('model_cards')
@Index(['userId', 'modelId', 'version'], { unique: true })
export class ModelCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  @Column({ type: 'integer' })
  version: number;

  /** Frozen engine verdict: the full card incl. deterministic cardFingerprint. */
  @Column({ type: 'jsonb' })
  card: ModelCardContent;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
