import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Live testing session participant (FORGE TQ-024). One invited collaborator
// on a live session. The collaboration engine owns the role law (owner,
// tester, observer) and the invitation state machine (invited, active,
// revoked); this row is the durable audit record of who was invited by whom
// and what they were allowed to do.

@Entity('live_test_participants')
@Index(['sessionId', 'userId'])
export class SessionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'tester' })
  role: string;

  @Column({ type: 'varchar', length: 16, default: 'invited' })
  state: string;

  @Column({ type: 'uuid', nullable: true })
  invitedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
