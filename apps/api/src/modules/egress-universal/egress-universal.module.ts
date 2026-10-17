// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/egress-universal.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EgressConnection } from './entities/egress-connection.entity';
import { EgressCallLog } from './entities/egress-call-log.entity';
import { EgressQuota } from './entities/egress-quota.entity';
import { UniversalEgressService } from './universal-egress.service';
import { UniversalEgressController } from './universal-egress.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EgressConnection, EgressCallLog, EgressQuota])],
  providers: [UniversalEgressService],
  controllers: [UniversalEgressController],
  exports: [UniversalEgressService],
})
export class EgressUniversalModule {}
