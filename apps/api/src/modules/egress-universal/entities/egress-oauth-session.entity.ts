// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/entities/egress-oauth-session.entity.ts
// ============================================================================

// A browser "tap to connect" session: one row per OAuth authorization
// attempt. The state is a single-use secret binding the provider redirect
// back to the user who started the flow; the PKCE verifier travels with it
// and never leaves the server. TTL is enforced by the oauth-session engine.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('egress_oauth_sessions')
@Index(['state'], { unique: true })
@Index(['userId', 'createdAt'])
export class EgressOauthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  destinationId: string;

  @Column({ type: 'text' })
  state: string;

  @Column({ type: 'text' })
  codeVerifier: string;

  @Column({ type: 'text' })
  codeChallenge: string;

  @Column({ type: 'text' })
  redirectUri: string;

  @Column({ type: 'text', default: 'pending' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
