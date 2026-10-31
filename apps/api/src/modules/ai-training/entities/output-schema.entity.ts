// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/output-schema.entity.ts
// ============================================================================
// One row per registered structured-output schema (FORGE AI-056). Fields
// are stored canonically sorted by name; the os_ fingerprint is invariant
// to field order. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OutputSchemaValue } from '../engine/model-gateway-ops-engine';

@Entity('output_schemas')
@Index(['userId', 'schemaId'])
export class OutputSchema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  schemaId: string;

  /** os_ fingerprint over schemaId:canonical fields. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  /** schemaId + canonical fields. */
  @Column({ type: 'jsonb' })
  schema: OutputSchemaValue;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
