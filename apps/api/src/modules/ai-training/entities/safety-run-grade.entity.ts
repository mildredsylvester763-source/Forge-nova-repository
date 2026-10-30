// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/safety-run-grade.entity.ts
// ============================================================================
// One row per graded safety run (FORGE AI-025) — durable audit evidence that a
// model was tested against a named battery and what it refused or leaked.
// Grades are appendable history: every grade is kept, none overwritten, so a
// safety claim can always be traced to the exact run that produced it.
// Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export interface SafetyGradeSnapshot {
  batteryId: string;
  total: number;
  passed: number;
  violations: string[];
  passRate: number;
}

@Entity('safety_run_grades')
@Index(['userId', 'batteryId'])
export class SafetyRunGrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  batteryId: string;

  /** Frozen engine verdict for this run. */
  @Column({ type: 'jsonb' })
  grade: SafetyGradeSnapshot;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
