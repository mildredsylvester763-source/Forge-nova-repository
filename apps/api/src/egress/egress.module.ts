// ============================================================================
// FILE: /apps/api/src/egress/egress.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { EgressGatewayService } from './egress-gateway.service';

@Module({
  providers: [EgressGatewayService],
  exports: [EgressGatewayService],
})
export class EgressModule {}
