// ============================================================================
// FILE: /apps/api/src/modules/payment-links/entities/payment-link.entity.ts
// ============================================================================
// A payment link is a capability: possession of the token is what grants
// payment, exactly like Stripe payment links. Single-use by default.
// 'consumed' and 'expired' are DERIVED states computed by the engine from
// uses/expiresAt — the stored status only ever says 'active' or 'canceled'.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type StoredLinkStatus = 'active' | 'canceled';

@Entity('payment_links')
@Index(['userId', 'status'])
@Index('idx_payment_links_token', ['token'], { unique: true })
export class PaymentLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** 244 bits of randomness. This IS the capability — treat it like a key. */
  @Column()
  token: string;

  @Column({ type: 'uuid', nullable: true })
  invoiceId?: string;

  /** Locked amount in cents. Null means pay-what-was-invoiced. */
  @Column({ type: 'integer', nullable: true })
  amountCents?: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'boolean', default: true })
  singleUse: boolean;

  @Column({ type: 'integer', nullable: true })
  maxUses?: number;

  @Column({ type: 'integer', default: 0 })
  uses: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'enum', enum: ['active', 'canceled'] as const, default: 'active' as const })
  status: StoredLinkStatus;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
