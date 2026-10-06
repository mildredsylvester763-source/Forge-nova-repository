// ============================================================================
// FILE: /apps/api/src/modules/auth/entities/refresh-token.entity.ts
// ============================================================================
// Refresh tokens are stored hashed (SHA-256) — a database leak must not
// yield usable tokens. Rotation: every refresh consumes the token row and
// issues a new pair; reuse of a consumed token is treated as theft and
// revokes the whole family.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
@Index(['userId', 'revokedAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // SHA-256 of the token — never the token itself.
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  // Family id groups a rotation chain; reuse detection kills the family.
  @Column({ type: 'uuid' })
  @Index()
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  // Forensics: where the token was issued from.
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  public get isExpired(): boolean {
    return this.expiresAt.getTime() < Date.now();
  }
}
