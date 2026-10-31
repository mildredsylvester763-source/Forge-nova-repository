import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Session step (FORGE TQ-002..008). Every action the AI tester performs in a
// live session: the platform action, its target, the deterministic narration
// and the payload. Typed values are narrated by length only, never echoed,
// so secrets survive the log by construction.

@Entity('live_test_steps')
@Index(['sessionId', 'seq'])
export class SessionStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'integer' })
  seq: number;

  @Column({ type: 'varchar', length: 8, default: 'ai' })
  actor: string;

  @Column({ type: 'varchar', length: 32 })
  action: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  target: string | null;

  @Column({ type: 'varchar', length: 1000 })
  narration: string;

  @Column({ type: 'jsonb', default: {} })
  payload: unknown;

  @Column({ type: 'varchar', length: 16, default: 'recorded' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
