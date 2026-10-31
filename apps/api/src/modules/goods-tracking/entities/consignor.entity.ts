// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/entities/consignor.entity.ts
// ============================================================================

// A consignor hands stock to the owner's shop but keeps ownership until it
// sells. The default commission is the share of each sale the shop keeps.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('consignors')
@Index(['userId', 'name'], { unique: true })
export class Consignor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'integer', default: 0 })
  defaultCommissionPct: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
