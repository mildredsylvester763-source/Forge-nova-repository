// ============================================================================
// FILE: /apps/api/src/modules/agent/entities/agent-command.entity.ts
// ============================================================================
// The agent's audit trail: every command the user issued, what the agent
// understood (or refused to guess), and the response it produced. A refusal
// is a first-class outcome here — ok=false rows are how we tune the agent.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('agent_commands')
@Index(['userId', 'createdAt'])
export class AgentCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  rawText: string;

  @Column({ type: 'text', nullable: true })
  normalizedText?: string;

  @Column({ type: 'text', nullable: true })
  intent?: string;

  @Column({ type: 'text', nullable: true })
  refusalReason?: string;

  @Column({ type: 'jsonb', default: {} })
  response: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
