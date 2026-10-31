// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/capability-matrix.entity.ts
// ============================================================================
// One row per model capability registration (FORGE AI-055). code / vision /
// audio / tools — the truth routing matches against, never guessed from
// marketing names. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CapabilityMatrixValue } from '../engine/model-gateway-ops-engine';

@Entity('capability_matrices')
@Index(['userId', 'modelId'])
export class CapabilityMatrix {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** cap_ fingerprint over the canonical matrix. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  /** capabilities, maxContextTokens, costPer1kIn/Out, active. */
  @Column({ type: 'jsonb' })
  matrix: CapabilityMatrixValue;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
