// ============================================================================
// FILE: /apps/api/src/modules/system/system.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';
import { EgressConnection } from '../egress-universal/entities/egress-connection.entity';
import { EgressCallLog } from '../egress-universal/entities/egress-call-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EgressConnection, EgressCallLog])],
  providers: [SystemService],
  controllers: [SystemController],
})
export class SystemModule {}
