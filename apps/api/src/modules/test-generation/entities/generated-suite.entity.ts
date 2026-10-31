import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Generated test suite (FORGE TQ-031..035). One stored suite per generation
// run: kind (unit, integration, e2e, property, fuzz), the target it was
// generated against, the RNG seed (default 42, always explicit so every
// suite is reproducible), an 8 hex FNV-1a checksum over the case names,
// and the case rows as jsonb. Suites are per-user and never shared.

@Entity('generated_suites')
@Index(['userId'])
export class GeneratedSuite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  kind: string;

  @Column({ type: 'varchar', length: 200 })
  target: string;

  @Column({ type: 'int', default: 42 })
  seed: number;

  @Column({ type: 'varchar', length: 8 })
  checksum: string;

  @Column({ type: 'jsonb', default: [] })
  cases: Record<string, unknown>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
