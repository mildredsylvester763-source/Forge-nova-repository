import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// The marketing overlay for a catalog item when it is listed to external
// sales channels. Mirrors the fields shops sync to Meta catalogs: title,
// description, image, link, brand, availability, condition, currency and
// the optional gtin and mpn identifiers.
@Entity('feed_listings')
@Index(['userId', 'itemId'], { unique: true })
export class FeedListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  imageUrl: string;

  @Column({ type: 'text' })
  productUrl: string;

  @Column({ type: 'text', nullable: true })
  brand?: string;

  @Column({ type: 'text', default: 'in stock' })
  availability: string;

  @Column({ type: 'text', default: 'new' })
  condition: string;

  @Column({ type: 'text', default: 'USD' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  gtin?: string;

  @Column({ type: 'text', nullable: true })
  mpn?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
