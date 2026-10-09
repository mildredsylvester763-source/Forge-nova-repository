import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatternsService } from './patterns.service';
import { PatternsController } from './patterns.controller';
import { Pattern } from './entities/pattern.entity';
import { Experiment } from '../experiments/entities/experiment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pattern, Experiment])],
  controllers: [PatternsController],
  providers: [PatternsService],
  exports: [PatternsService],
})
export class PatternsModule {}
