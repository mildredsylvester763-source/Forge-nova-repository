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
import { ServingScalePlan } from './entities/serving-scale-plan.entity';
import { QuantizationPlanRow } from './entities/quantization-plan.entity';
import { OnDeviceBundle } from './entities/on-device-bundle.entity';
import { RoutingDecision } from './entities/routing-decision.entity';
import { ResponseCacheEntry } from './entities/response-cache-entry.entity';
import { StreamSession } from './entities/stream-session.entity';
import { ServingMetricSample } from './entities/serving-metric-sample.entity';
import { ShadowDeployment } from './entities/shadow-deployment.entity';
import { RollbackEvent } from './entities/rollback-event.entity';
import { ModelPin } from './entities/model-pin.entity';
import { InstanceReservation } from './entities/instance-reservation.entity';
import { OnPremPackage } from './entities/on-prem-package.entity';

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
    ServingScalePlan,
    QuantizationPlanRow,
    OnDeviceBundle,
    RoutingDecision,
    ResponseCacheEntry,
    StreamSession,
    ServingMetricSample,
    ShadowDeployment,
    RollbackEvent,
    ModelPin,
    InstanceReservation,
    OnPremPackage,
    ]),
  ],
  controllers: [AiTrainingController],
  providers: [AiTrainingService],
  exports: [AiTrainingService],
})
export class AiTrainingModule {}
