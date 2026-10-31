// ============================================================================
// FILE: /apps/api/src/modules/ai-training/entities/gateway-route-event.entity.ts
// ============================================================================
// One row per gateway routing decision (FORGE AI-048) — append-only
// evidence of which provider served (or was refused for) a request,
// with the full failover chain frozen at decision time. Zero-trust scoped.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RouteDecision } from '../engine/model-gateway-engine';

@Entity('gateway_route_events')
export class GatewayRouteEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Frozen engine verdict: primary, chain, estimated cost, inactive refs. */
  @Column({ type: 'jsonb' })
  route: RouteDecision;

  /** Deterministic fingerprint of the routed decision. */
  @Column({ type: 'varchar', length: 72 })
  fingerprint: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
