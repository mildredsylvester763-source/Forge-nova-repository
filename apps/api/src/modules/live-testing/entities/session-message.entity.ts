import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Session message (FORGE TQ-007). Live chat beside the running session: the
// human asks what the tester is doing, redirects it or gives instructions.
// Human turns are stored verbatim; AI turns reference the narrated steps.

@Entity('live_test_messages')
@Index(['sessionId', 'createdAt'])
export class SessionMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 8 })
  role: string;

  @Column({ type: 'varchar', length: 2000 })
  body: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
