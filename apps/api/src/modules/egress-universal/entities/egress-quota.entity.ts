// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/entities/egress-quota.entity.ts
// ============================================================================

// Monthly egress budget per user. One row per user per month; `used` is the
// number of completed outbound executions this month.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('egress_quotas')
@Index(['userId', 'month'], { unique: true })
export class EgressQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text', default: 'free' })
  tier: string;

  @Column({ type: 'text' })
  month: string;

  @Column({ type: 'int', default: 0 })
  used: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
