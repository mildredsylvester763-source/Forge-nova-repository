// ============================================================================
// FILE: /apps/api/src/modules/crm-activities/entities/activity.entity.ts
// ============================================================================

// A CRM outreach activity: call, email, follow-up. `valueCents` is the
// pipeline value the action would unlock; `lastDoneAt` feeds the stale
// boost in the ranking engine.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('crm_activities')
@Index(['userId', 'dueAt'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  contactId?: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: 'general' })
  kind: string;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt?: Date;

  @Column({ type: 'integer', default: 0 })
  valueCents: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastDoneAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
