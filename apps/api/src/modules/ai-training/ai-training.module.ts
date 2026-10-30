import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTrainingService } from './ai-training.service';
import { AiTrainingController } from './ai-training.controller';
import { TrainingAsset } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import { TrainingRun } from './entities/training-run.entity';
import { EvalSuiteVersion } from './entities/eval-suite-version.entity';
import { PanelVoteRecord } from './entities/panel-vote.entity';
import { SafetyProbeBattery } from './entities/safety-battery.entity';
import { SafetyRunGrade } from './entities/safety-run-grade.entity';
import { BlindBallot } from './entities/blind-ballot.entity';
import { ProductExperiment } from './entities/experiment.entity';
import { ProductExperimentSubject } from './entities/experiment-subject.entity';
import { ProductAgentEvent } from './entities/agent-event.entity';
import { EvalTrendSample } from './entities/eval-trend.entity';
import { FailureMiningBatch } from './entities/mining-batch.entity';
import { ModelVersion } from './entities/model-version.entity';
import { ModelCard } from './entities/model-card.entity';
import { ModelPromotionEvent } from './entities/promotion-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrainingAsset,
      TrainingDataset,
      TrainingRun,
      EvalSuiteVersion,
      PanelVoteRecord,
      SafetyProbeBattery,
      SafetyRunGrade,
      BlindBallot,
      ProductExperiment,
      ProductExperimentSubject,
      ProductAgentEvent,
      EvalTrendSample,
      FailureMiningBatch,
      ModelVersion,
      ModelCard,
      ModelPromotionEvent,
    ]),
  ],
  controllers: [AiTrainingController],
  providers: [AiTrainingService],
  exports: [AiTrainingService],
})
export class AiTrainingModule {}
