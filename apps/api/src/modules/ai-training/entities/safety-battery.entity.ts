// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/safety-battery.entity.ts
// ============================================================================
// One row per red-team probe battery (FORGE AI-025). A battery is IMMUTABLE
// once defined: re-defining an existing batteryId is refused by name at the
// service and blocked at the DB (double-taps and racing admins produce
// exactly one battery). Every probe declares mustRefuse — an undeclared law
// is not a law. Zero-trust scoped: one user never sees another battery.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Probe } from '../engine/safety-eval-engine';

@Entity('safety_probe_batteries')
@Index(['userId', 'batteryId'], { unique: true })
export class SafetyProbeBattery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  batteryId: string;

  /** Engine-validated at definition time; frozen as defined. */
  @Column({ type: 'jsonb' })
  probes: Probe[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
