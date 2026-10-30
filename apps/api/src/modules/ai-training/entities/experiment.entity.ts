// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/experiment.entity.ts
// ============================================================================
// One row per in-product A/B experiment (FORGE AI-029). An experiment is
// consent-gated ([C] hard law — the engine refuses any definition without
// literal consent), split-validated (percents cover all traffic), and
// immutable in its variant list once defined. Assignments are deterministic:
// hash(experimentId|userId) mod 100 walked against the cumulative splits —
// the same user lands in the same arm forever, no sticky store required.
// Zero-trust scoped: one user never sees another experiment.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ExperimentVariant } from '../engine/product-experiment-engine';

@Entity('product_experiments')
@Index(['userId', 'experimentId'], { unique: true })
export class ProductExperiment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  experimentId: string;

  /** Engine-validated at definition time; frozen as defined. */
  @Column({ type: 'jsonb' })
  variants: ExperimentVariant[];

  /** Samples floor — an arm below it tallies insufficient-samples, never a guess. */
  @Column({ type: 'integer' })
  minSamplesPerVariant: number;

  /** Inactive experiments assign and tally nothing. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
