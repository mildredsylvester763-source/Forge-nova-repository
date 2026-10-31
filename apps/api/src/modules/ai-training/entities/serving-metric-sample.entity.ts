// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/serving-metric-sample.entity.ts
// ============================================================================
// One serving telemetry sample (FORGE AI-042): latency, tokens, cost and
// success for a single request. Rows are raw observations; the honest
// p50/p95/p99, error rate and cost-per-1k aggregates are computed by the
// engine at read time — never stored pre-aggregated, never smoothed.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MetricSample } from '../engine/model-operations-engine';

@Entity('serving_metric_samples')
@Index(['userId', 'modelId'])
export class ServingMetricSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  modelId: string;

  /** The raw sample: latencyMs, tokens, costUsd, ok, ttftMs. */
  @Column({ type: 'jsonb' })
  sample: MetricSample;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
