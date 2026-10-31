import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A generated Google Merchant Center feed. The XML text is stored exactly as
// generated and the status stays 'recorded' because no adapter submits it
// anywhere. The skipped list names every candidate that was left out and why,
// so the record is a complete honest snapshot.
@Entity('shopping_feed_records')
@Index(['userId'])
export class ShoppingFeedRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  xml: string;

  @Column({ type: 'integer' })
  itemCount: number;

  @Column({ type: 'simple-json' })
  skipped: { id: string; reason: string }[];

  @Column({ type: 'text', default: 'recorded' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
