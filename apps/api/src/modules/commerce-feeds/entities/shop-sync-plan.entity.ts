import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A planned sync of one variant into a Meta catalog. There is no Meta
// adapter yet, so nothing pretends to be sent: each row is an immutable
// snapshot of the exact catalog item payload that would be submitted, and
// the status stays 'planned' forever. Honest record keeping only.
@Entity('shop_sync_plans')
@Index(['userId', 'channel'])
export class ShopSyncPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  channel: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid' })
  variantId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @Column({ type: 'text', default: 'planned' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
