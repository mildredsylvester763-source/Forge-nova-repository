// ============================================================================
// FILE: /apps/api/src/modules/auth/entities/user.entity.ts
// ============================================================================
// Zero-trust identity. Passwords are bcrypt-hashed (cost 12) — never stored
// or logged in plain text. OAuth identities link by provider + providerId.
// Email is UNIQUE at the database level (services store it lowercased).

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  DeleteDateColumn,
} from 'typeorm';

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}

export enum UserStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

@Entity('users')
@Unique(['provider', 'providerId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Credentials (local email + password) ──────────────────────────────────────
  @Column({ type: 'varchar', length: 320, nullable: true, unique: true })
  email?: string;

  // bcrypt hash, cost 12. Null when the user only uses social login.
  @Column({ type: 'varchar', length: 100, nullable: true })
  passwordHash?: string | null;

  // ─── OAuth identity ───────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerId?: string;

  @Column({ type: 'jsonb', nullable: true })
  providerProfile?: Record<string, any>;

  // ─── Profile ─────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  // ─── Access & state ────────────────────────────────────────────────
  @Column({ type: 'enum', enum: UserRole, default: UserRole.OWNER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  // Progressive lockout: set on the 5th consecutive failure, cleared on success.
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt?: Date;
}

// What may ever leave the server about a user.
export type SafeUser = Omit<User, 'passwordHash' | 'providerProfile' | 'failedLoginAttempts' | 'lockedUntil'>;
