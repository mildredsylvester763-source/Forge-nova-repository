import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NpsResponse } from './entities/nps-response.entity';
import { ChurnAssessment } from './entities/churn-assessment.entity';
import { NpsController } from './nps.controller';
import { ChurnController } from './churn.controller';
import { NpsService } from './nps.service';
import { ChurnService } from './churn.service';

@Module({
  imports: [TypeOrmModule.forFeature([NpsResponse, ChurnAssessment])],
  controllers: [NpsController, ChurnController],
  providers: [NpsService, ChurnService],
  exports: [NpsService, ChurnService],
})
export class CustomerHealthModule {}
