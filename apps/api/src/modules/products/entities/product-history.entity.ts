// ============================================================================
// FILE: /apps/api/src/modules/products/entities/product-history.entity.ts
// ============================================================================
// Immutable append-only audit trail for products, same discipline as
// OpportunityHistory. Matches every field createHistory() writes.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

export type ProductHistoryActionType =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'STATUS_CHANGE';

@Entity('product_history')
@Index(['productId', 'changedAt'])
@Index(['userId', 'changedAt'])
export class ProductHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  productId: string;

  @ManyToOne(() => Product, (p) => p.histories, { onDelete: 'cascade' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', { length: 32 } })
  action: ProductHistoryActionType;

  @Column({ type: 'jsonb', nullable: true })
  changes?: Record<string, any>;

  @Column({ type: 'varchar', { length: 32 }, nullable: true })
  oldStatus?: string;

  @Column({ type: 'varchar', { length: 32 }, nullable: true })
  newStatus?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'varchar', { length: 16 }, default: 'system' })
  source: 'user' | 'system' | 'agent';

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  changedAt: Date;
}
