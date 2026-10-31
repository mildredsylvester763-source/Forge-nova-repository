// Test quality golden entity (FORGE TQ-036..040): one persisted snapshot
// row per user and name. The engines stay pure; this row stores the
// canonical serialization and its checksum so golden files survive
// restarts and can be verified on every later run.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('test_quality_goldens')
@Index(['userId'])
export class TestQualityGolden {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 8 })
  checksum: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
