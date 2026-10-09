// ============================================================================
// FILE: /apps/api/src/modules/time-budget/entities/time-budget.entity.ts
// ============================================================================
// One row per user per ISO week: the capacity the owner committed, what
// asked for time, what the planner granted, and what actually happened.
// The plan is a durable record — guardrails only protect a week whose
// budget was declared BEFORE the week happened.

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn, Unique, Index,
} from 'typeorm';

export type TimePriority = 'critical' | 'high' | 'normal' | 'low';

export interface PlannedAllocation {
  ref: string;
  label: string;
  requestedHours: number;
  grantedHours: number;
  priority: TimePriority;
  deficit: number;
}

export interface ActualEntry {
  ref: string;
  hours: number;
  note?: string;
  loggedAt: string;
}

@Entity('time_budgets')
@Unique(['userId', 'weekStart'])
@Index(['userId', 'weekStart'])
export class TimeBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  // Monday of the ISO week, stored as a plain date (no time component).
  @Column({ type: 'date' })
  weekStart: string;

  @Column({ type: 'decimal', precision: 6, scale: 1 })
  capacityHours: number;

  // The raw requests the owner declared, preserved for audit.
  @Column({ type: 'jsonb', default: [] })
  requests: Array<{ ref: string; label: string; requestedHours: number; priority: TimePriority }>;

  // The pure planner's output — grants, deficits, ordering.
  @Column({ type: 'jsonb', default: [] })
  allocations: PlannedAllocation[];

  // Guardrail warnings computed at plan time and after each actual entry.
  @Column({ type: 'jsonb', default: [] })
  warnings: string[];

  // What actually happened, appended immutably by recordActual.
  @Column({ type: 'jsonb', default: [] })
  actuals: ActualEntry[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;
}
