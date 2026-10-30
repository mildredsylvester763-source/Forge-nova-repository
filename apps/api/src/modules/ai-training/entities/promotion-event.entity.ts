// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/promotion-event.entity.ts
// ============================================================================
// Append-only audit of every staged promotion (FORGE AI-035): experimental ->
// internal -> beta -> stable, one stage at a time, gates enforced by the
// engine before the event is written. The event is the durable proof of WHO
// moved WHAT version WHERE, with the deterministic promotion fingerprint.
// Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ModelStage } from '../engine/model-registry-engine';

@Entity('model_promotion_events')
@Index(['userId', 'modelId', 'version'])
export class ModelPromotionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'varchar', length: 16 })
  fromStage: ModelStage;

  @Column({ type: 'varchar', length: 16 })
  toStage: ModelStage;

  /** Deterministic promotion fingerprint (promofp_ + djb2). */
  @Column({ type: 'varchar', length: 64 })
  promotionFingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
