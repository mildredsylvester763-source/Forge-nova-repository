import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One sellable combination of the parent item's options. The SKU matches a
// real stock item so variant and stock truth can never drift apart.
@Entity('catalog_variants')
@Index(['userId', 'sku'], { unique: true })
@Index(['userId', 'barcode'])
export class CatalogVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'text', default: '[]' })
  optionValuesJson: string;

  @Column({ type: 'text', nullable: true })
  barcode?: string;

  @Column({ type: 'integer', default: 0 })
  unitPriceCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
