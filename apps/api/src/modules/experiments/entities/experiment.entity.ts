// ============================================================================
// FILE: /apps/api/src/modules/experiments/entities/experiment.entity.ts
// ============================================================================
// One experiment = one honest question about the market. It belongs to a
// user, optionally links to the opportunity or product it tests, and never
// mutates its own results once recorded — decisions are appended, not
// rewritten. Zero-trust: every query is scoped by userId.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';

export enum ExperimentStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  DECIDED = 'decided',
  CANCELLED = 'cancelled',
}

export enum ExperimentVerdict {
  WIN = 'win',
  LOSE = 'lose',
  INCONCLUSIVE = 'inconclusive',
}

@Entity('experiments')
@Index(['userId', 'status'])
@Index(['userId', 'createdAt'])
export class Experiment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ length: 255 })
  name: string;

  // What we believe, in one falsifiable sentence.
  @Column({ type: 'text' })
  hypothesis: string;

  // What the result will teach us even if the hypothesis fails.
  @Column({ type: 'text', nullable: true })
  learningGoal?: string;

  @Column({ type: 'varchar', length: 64 })
  successMetric: string;

  // Required relative lift for a WIN, as a fraction (0.10 = +10%).
  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0.1 })
  successThreshold: number;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  opportunityId?: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  productId?: string;

  @Column({ type: 'enum', enum: ExperimentStatus, default: ExperimentStatus.DRAFT })
  status: ExperimentStatus;

  // Recorded observations. Baseline is the control; variant the change.
  @Column({ type: 'jsonb', default: { visitors: 0, conversions: 0 } })
  baseline: Record<string, any>;

  @Column({ type: 'jsonb', default: { visitors: 0, conversions: 0 } })
  variant: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt?: Date;

  @Column({ type: 'enum', enum: ExperimentVerdict, nullable: true })
  verdict?: ExperimentVerdict;

  // The engine's full explanation: lift, sample guards, factors.
  @Column({ type: 'jsonb', nullable: true })
  evaluation?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  conclusion?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;
}
