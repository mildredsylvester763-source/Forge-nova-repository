// ============================================================================
// FILE: /apps/api/src/modules/budgets/entities/budget.entity.ts
// ============================================================================

// One budget line per user + category + month. Integer cents only.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('budgets')
@Index(['userId', 'category', 'month'], { unique: true })
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Lowercased category label, matched against expenses.category. */
  @Column({ type: 'text' })
  category: string;

  /** 'YYYY-MM'. */
  @Column({ type: 'text' })
  month: string;

  @Column({ type: 'integer' })
  budgetCents: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
