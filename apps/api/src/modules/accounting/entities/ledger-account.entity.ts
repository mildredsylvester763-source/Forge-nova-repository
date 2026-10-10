// ============================================================================
// FILE: /apps/api/src/modules/accounting/entities/ledger-account.entity.ts
// ============================================================================
// Chart of accounts. Balances are NEVER stored on the account — they are
// aggregated from immutable journal lines at read time, exactly like real
// accounting engines (Stripe-style payment ledgers). An account can be
// archived but never deleted once it has journals against it.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense',
}

@Entity('ledger_accounts')
@Index(['userId', 'code'])
@Index(['userId', 'type'])
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Human chart code: 1010 Cash, 1100 Accounts Receivable, ... */
  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
