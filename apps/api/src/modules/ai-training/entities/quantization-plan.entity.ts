// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/quantization-plan.entity.ts
// ============================================================================
// One row per accepted quantization plan (FORGE AI-037) — the honest
// compression contract: method, size factor, compressed bytes, estimated
// quality loss inside the caller budget, calibration sample count, and the
// deterministic fingerprint. Same fingerprint = same plan = idempotent
// double-tap (reused); a plan that would blow the quality budget was refused
// by the engine before any row exists. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { QuantizationPlan } from '../engine/model-serving-engine';

@Entity('quantization_plans')
@Index(['userId', 'fingerprint'], { unique: true })
export class QuantizationPlanRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  @Column({ type: 'varchar', length: 16 })
  method: string;

  /** quantfp_<hex> — same inputs, same plan, forever. */
  @Column({ type: 'varchar', length: 40 })
  fingerprint: string;

  /** Frozen engine verdict. */
  @Column({ type: 'jsonb' })
  plan: QuantizationPlan;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
