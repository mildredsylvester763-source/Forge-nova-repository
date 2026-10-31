import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Seeded test account for live agent testing (FORGE TQ-029). The test data
// lifecycle engine derives every fixture account deterministically from
// the session seed, on the reserved forgelocal.test domain which can never
// resolve to a real host or reach a real inbox. Cleanup is terminal-only,
// idempotent and audited: a cleaned account is marked with cleanedAt and a
// cleanup step, never silently dropped.

@Entity('live_test_accounts')
@Index(['sessionId'])
export class TestAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 128 })
  email: string;

  @Column({ type: 'varchar', length: 64 })
  password: string;

  @Column({ type: 'varchar', length: 16, default: 'shopper' })
  role: string;

  @Column({ type: 'varchar', length: 16, default: 'created' })
  state: string;

  @Column({ type: 'timestamp', nullable: true })
  cleanedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
