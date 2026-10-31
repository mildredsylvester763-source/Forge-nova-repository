// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/model-pin.entity.ts
// ============================================================================
// One row per workspace model pin (FORGE AI-045) — the frozen choice of which
// exact version serves a workspace. A pin survives registry promotion storms:
// even when newer versions go stable, the pinned workspace keeps its version
// until a human switches it (GP-016: switch-back trace kept via switchedFrom).
// Tier law is per model in the registry, never a blanket plan tier (MT-104).
// Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PinPlan } from '../engine/model-access-engine';

@Entity('model_pins')
@Index(['userId', 'workspaceId'])
export class ModelPin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  workspaceId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Frozen engine verdict: version, tier provenance, switchedFrom trace. */
  @Column({ type: 'jsonb' })
  pin: PinPlan;

  /** Deterministic engine fingerprint — the pin identity, not a hash of luck. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
