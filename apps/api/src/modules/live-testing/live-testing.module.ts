import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestSession } from './entities/test-session.entity';
import { SessionStep } from './entities/session-step.entity';
import { SessionMessage } from './entities/session-message.entity';
import { SessionFinding } from './entities/session-finding.entity';
import { LiveTestingService } from './live-testing.service';
import { LiveTestingController } from './live-testing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TestSession,
      SessionStep,
      SessionMessage,
      SessionFinding,
    ]),
  ],
  providers: [LiveTestingService],
  controllers: [LiveTestingController],
})
export class LiveTestingModule {}
