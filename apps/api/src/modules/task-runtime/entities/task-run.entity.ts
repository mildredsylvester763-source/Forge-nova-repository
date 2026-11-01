// Task run entity (FORGE AI-079..083): one persisted run per user task.
// The engines stay pure; this row stores the folded state and the
// append-only event journal so runs survive restarts and can be replayed
// from any sequence point.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('task_runs')
@Index(['userId'])
export class TaskRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  goal: string;

  @Column({ type: 'varchar', length: 16 })
  state: string;

  @Column({ type: 'jsonb', default: [] })
  events: Record<string, unknown>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
