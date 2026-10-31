import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// How much of one SKU sits at one location. Every change goes through the
// engines, so the number is always a planned receipt or transfer.
@Entity('location_stock')
@Index(['userId', 'locationId', 'sku'], { unique: true })
export class LocationStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  locationId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'integer', default: 0 })
  onHand: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
