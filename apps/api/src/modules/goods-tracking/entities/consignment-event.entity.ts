// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/entities/consignment-event.entity.ts
// ============================================================================

// The immutable consignment ledger. kind: sale rows carry the exact money
// split (total, commission kept by the shop, payout owed to the consignor);
// return rows hand unsold stock back and carry no money at all.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('consignment_events')
@Index(['userId', 'consignorId'])
export class ConsignmentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  consignorId: string;

  @Column({ type: 'text' })
  sku: string;

  @Column({ type: 'text' })
  kind: string;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ type: 'integer', nullable: true })
  unitPriceCents: number | null;

  @Column({ type: 'integer' })
  commissionPct: number;

  @Column({ type: 'integer', nullable: true })
  totalCents: number | null;

  @Column({ type: 'integer', nullable: true })
  commissionCents: number | null;

  @Column({ type: 'integer', nullable: true })
  payoutCents: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
