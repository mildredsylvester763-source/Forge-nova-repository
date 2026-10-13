// ============================================================================
// FILE: /apps/api/src/modules/contacts/entities/contact.entity.ts
// ============================================================================
// A contact is a customer or vendor's human identity. dedupeKey is the
// deterministic identity: 'email:<normalized>' when an email exists,
// 'name:<normalized>' otherwise — unique per user so the same person can
// never be double-created.

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contacts')
@Index(['userId', 'dedupeKey'], { unique: true })
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  companyName?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column()
  dedupeKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
