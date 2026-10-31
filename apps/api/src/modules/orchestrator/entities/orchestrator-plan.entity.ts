// Orchestrator plan entity (FORGE AI-073..078): one persisted plan row per
// user goal. The engines stay pure; this row stores the classified intent,
// previewed risk, estimated cost, the approval requirement and the sequenced
// step chain so plans survive restarts and can be edited before approval.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('orchestrator_plans')
@Index(['userId'])
export class OrchestratorPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  goal: string;

  @Column({ type: 'varchar', length: 32 })
  intent: string;

  @Column({ type: 'varchar', length: 16 })
  risk: string;

  @Column({ type: 'int', default: 0 })
  estimatedCost: number;

  @Column({ type: 'boolean', default: false })
  requiresApproval: boolean;

  @Column({ type: 'jsonb', default: [] })
  steps: Record<string, unknown>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
