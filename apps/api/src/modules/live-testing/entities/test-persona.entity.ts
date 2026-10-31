import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Custom test persona (FORGE TQ-014). Users define their own personas
// beyond the built-in catalog: a name unique per user and workspace, a
// trait list, a derived checklist and a pacing multiplier. Names are
// normalized to trimmed lowercase and may never shadow a built-in; rows
// are user-owned and cross-user access is a uniform not-found refusal.

@Entity('live_test_personas')
@Index(['userId', 'workspace'])
export class TestPersona {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64, default: 'default' })
  workspace: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'jsonb', default: [] })
  traits: unknown[];

  @Column({ type: 'jsonb', default: [] })
  checklist: unknown[];

  @Column({ type: 'real', default: 1 })
  paceMultiplier: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
