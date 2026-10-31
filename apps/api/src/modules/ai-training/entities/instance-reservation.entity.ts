// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/instance-reservation.entity.ts
// ============================================================================
// One row per dedicated-instance reservation (FORGE AI-046) — exclusive
// serving capacity held by an enterprise workspace against a model pool.
// The plan carries the exact free-capacity arithmetic at grant time; the
// pool total lives in serving config, over-commit is refused by name and
// NEVER silently downsized. Zero-trust scoped to the owning user.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ReservationPlan } from '../engine/model-access-engine';

@Entity('instance_reservations')
@Index(['userId', 'modelId'])
export class InstanceReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  workspaceId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Frozen engine verdict: slots, freeAfter at grant time, duplicate flag. */
  @Column({ type: 'jsonb' })
  reservation: ReservationPlan;

  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
