// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/stream-session.entity.ts
// ============================================================================
// One streaming response session (FORGE AI-041): the reducer state the
// engine evolves — contiguous chunks, terminal cancel, exact-suffix resume.
// The state stored here is only ever produced by applyStreamEvent, so a
// gap, a double-complete or an invented suffix can never reach the DB.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { StreamState } from '../engine/model-operations-engine';

@Entity('stream_sessions')
@Index(['userId', 'streamId'])
export class StreamSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  streamId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** Frozen reducer state: status (open/cancelled/completed) + chunk list. */
  @Column({ type: 'jsonb' })
  state: StreamState;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
