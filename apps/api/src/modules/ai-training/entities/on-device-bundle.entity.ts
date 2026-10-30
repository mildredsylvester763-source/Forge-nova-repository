// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/on-device-bundle.entity.ts
// ============================================================================
// One row per accepted on-device offline bundle (FORGE AI-038) — the
// device-fit contract: quantized bytes vs device memory, honest headroom
// (bytes AND ratio), a real offline runtime, and the deterministic
// fingerprint. Same fingerprint = same bundle = idempotent double-tap
// (reused); a bundle that would not fit was refused by the engine before
// any row exists — Forge never ships a bundle that swaps. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DeviceBundle } from '../engine/model-serving-engine';

@Entity('on_device_bundles')
@Index(['userId', 'fingerprint'], { unique: true })
export class OnDeviceBundle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  @Column({ type: 'varchar', length: 32 })
  runtime: string;

  /** bundlefp_<hex> — same inputs, same bundle, forever. */
  @Column({ type: 'varchar', length: 40 })
  fingerprint: string;

  /** Frozen engine verdict. */
  @Column({ type: 'jsonb' })
  bundle: DeviceBundle;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
