import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentsService } from './experiments.service';
import { ExperimentsController } from './experiments.controller';
import { Experiment } from './entities/experiment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Experiment])],
  controllers: [ExperimentsController],
  providers: [ExperimentsService],
  exports: [ExperimentsService],
})
export class ExperimentsModule {}
