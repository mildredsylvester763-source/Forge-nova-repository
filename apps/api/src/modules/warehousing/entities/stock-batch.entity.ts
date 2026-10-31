import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One received batch or lot of a SKU at a location, with its expiry date.
// FEFO picking consumes the earliest expiry first; expired batches are
// disposed, never picked.
export type StockBatchStatus = 'fresh' | 'disposed';

@Entity('stock_batches')
@Index(['userId', 'sku', 'batchCode'], { unique: true })
@Index(['userId', 'status'])
export class StockBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid' })
  locationId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'text' })
  batchCode: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'integer' })
  receivedQty: number;

  @Column({ type: 'integer', default: 0 })
  remainingQty: number;

  @Column({ type: 'text', default: 'fresh' })
  status: StockBatchStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
