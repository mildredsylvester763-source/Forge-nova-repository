// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/serving-scale-plan.entity.ts
// ============================================================================
// One row per serving scale decision (FORGE AI-036) — the frozen autoscaling
// verdict for a model at a moment in time: Little's-law replica count, cautious
// down flag, deterministic GPU-pool assignment. Append-only history; an
// identical re-plan is idempotent at the service layer (reused), a changed
// plan appends. Caps and pool limits were enforced by the engine BEFORE the
// row exists — a refused plan stores nothing. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ScalePlan } from '../engine/model-serving-engine';

@Entity('serving_scale_plans')
@Index(['userId', 'modelId'])
export class ServingScalePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Frozen engine verdict: replicas, neededRaw, cautious flag, GPU assignment. */
  @Column({ type: 'jsonb' })
  plan: ScalePlan;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
