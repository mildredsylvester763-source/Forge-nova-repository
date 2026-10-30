// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/blind-ballot.entity.ts
// ============================================================================
// One row per blind side-by-side comparison ballot (FORGE AI-028). A voter
// votes ONCE per contest — double-taps and racing submissions produce exactly
// one ballot, refused by name at the service and blocked at the DB. The
// tally is the engine quorum law: honest ties, undecided quorum misses,
// never a coin flip. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('blind_ballots')
@Index(['userId', 'contestId', 'voterId'], { unique: true })
export class BlindBallot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  contestId: string;

  @Column({ type: 'varchar', length: 128 })
  voterId: string;

  /** Engine-validated at tally time; stored exactly as cast. */
  @Column({ type: 'varchar', length: 8 })
  preference: 'a' | 'b' | 'tie';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
