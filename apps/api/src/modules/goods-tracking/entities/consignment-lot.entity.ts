// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/entities/consignment-lot.entity.ts
// ============================================================================

// How much of each sku a consignor currently has on consignment with this
// owner. One row per owner, consignor and sku.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('consignment_lots')
@Index(['userId', 'consignorId', 'sku'], { unique: true })
export class ConsignmentLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  consignorId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'integer', default: 0 })
  qtyOnConsignment: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
