// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/on-prem-package.entity.ts
// ============================================================================
// One row per on-prem model bundle (FORGE AI-047) — a self-contained export:
// weights fingerprint, model card (via the registry), license terms and the
// package format tag travel together. Re-import must pass the same gates
// that allowed export (SY): weights match, quality gate, license accepted.
// Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OnPremPackage as OnPremPackageContent } from '../engine/model-access-engine';

@Entity('on_prem_packages')
@Index(['userId', 'modelId'])
export class OnPremPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Frozen engine verdict: format, weights fingerprint, quantized, license. */
  @Column({ type: 'jsonb' })
  pkg: OnPremPackageContent;

  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
