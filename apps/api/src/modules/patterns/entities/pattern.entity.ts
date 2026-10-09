// ============================================================================
// FILE: /apps/api/src/modules/patterns/entities/pattern.entity.ts
// ============================================================================
// One row per learned lesson: what worked or failed, in which category and
// source, with the evidence that proved it. Rows are created by hand or
// distilled from decided experiments (learnFromExperiment). Soft-deleted so
// nothing the user ever learned is silently destroyed.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum PatternKind {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

@Entity('patterns')
@Index(['userId', 'kind'])
export class Pattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: PatternKind })
  kind: PatternKind;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 64 })
  category: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence: Record<string, any> | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'uuid', nullable: true })
  experimentId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;
}
