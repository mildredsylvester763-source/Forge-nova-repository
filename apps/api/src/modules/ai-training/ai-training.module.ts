import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTrainingService } from './ai-training.service';
import { AiTrainingController } from './ai-training.controller';
import { TrainingAsset } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TrainingAsset, TrainingDataset])],
  controllers: [AiTrainingController],
  providers: [AiTrainingService],
  exports: [AiTrainingService],
})
export class AiTrainingModule {}
