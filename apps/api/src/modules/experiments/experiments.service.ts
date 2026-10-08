// ============================================================================
// FILE: /apps/api/src/modules/experiments/experiments.service.ts
// ============================================================================
// Hypothesis → test → learn → decide. The pure verdict engine lives in
// ./engine; this service owns persistence, state transitions, and the
// zero-trust ownership scoping used everywhere in Forge Nova.

import { Injectable, NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Experiment, ExperimentStatus, ExperimentVerdict } from './entities/experiment.entity';
import { CreateExperimentDto, RecordObservationDto } from './dto/create-experiment.dto';
import { evaluateExperiment, ExperimentArm } from './engine/experiment-evaluation';

@Injectable()
export class ExperimentsService {
  constructor(
    @InjectRepository(Experiment)
    private readonly experimentRepository: Repository<Experiment>,
  ) {}

  async create(userId: string, dto: CreateExperimentDto): Promise<Experiment> {
    const experiment = this.experimentRepository.create({
      ...dto,
      userId,
      successThreshold: dto.successThreshold ?? 0.1,
      status: ExperimentStatus.DRAFT,
      baseline: { visitors: 0, conversions: 0 },
      variant: { visitors: 0, conversions: 0 },
    });
    return this.experimentRepository.save(experiment);
  }

  async findAll(
    userId: string,
    options: { page?: number; limit?: number; status?: ExperimentStatus } = {},
  ): Promise<{ data: Experiment[]; total: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.status) where.status = options.status;
    const [data, total] = await this.experimentRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findOne(userId: string, id: string): Promise<Experiment> {
    return this.getOwned(userId, id);
  }

  async start(userId: string, id: string): Promise<Experiment> {
    const experiment = await this.getOwned(userId, id);
    if (experiment.status !== ExperimentStatus.DRAFT) {
      throw new ConflictException('Only a draft experiment can start (current: ' + experiment.status + ')');
    }
    experiment.status = ExperimentStatus.RUNNING;
    experiment.startedAt = new Date();
    return this.experimentRepository.save(experiment);
  }

  async recordObservation(userId: string, id: string, dto: RecordObservationDto): Promise<Experiment> {
    const experiment = await this.getOwned(userId, id);
    if (experiment.status !== ExperimentStatus.RUNNING) {
      throw new ConflictException('Observations are only recorded on running experiments (current: ' + experiment.status + ')');
    }
    // Observations are SET as totals, not incremented: the caller's numbers
    // are the source of truth, and re-recording corrects a bad entry.
    const arm: ExperimentArm = { visitors: dto.visitors, conversions: dto.conversions };
    if (arm.conversions > arm.visitors) {
      throw new UnprocessableEntityException('Conversions cannot exceed visitors on an arm');
    }
    experiment[dto.arm] = arm;
    return this.experimentRepository.save(experiment);
  }

  async decide(userId: string, id: string): Promise<Experiment> {
    const experiment = await this.getOwned(userId, id);
    if (experiment.status !== ExperimentStatus.RUNNING) {
      throw new ConflictException('Only a running experiment can be decided (current: ' + experiment.status + ')');
    }
    const num = (v: any): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const evaluation = evaluateExperiment(
      { visitors: num(experiment.baseline?.visitors), conversions: num(experiment.baseline?.conversions) },
      { visitors: num(experiment.variant?.visitors), conversions: num(experiment.variant?.conversions) },
      num(experiment.successThreshold),
    );
    experiment.status = ExperimentStatus.DECIDED;
    experiment.verdict = evaluation.verdict as ExperimentVerdict;
    experiment.evaluation = { ...evaluation, decidedAt: new Date().toISOString() };
    experiment.conclusion = evaluation.reasons.join(' ');
    experiment.endedAt = new Date();
    return this.experimentRepository.save(experiment);
  }

  async cancel(userId: string, id: string, reason?: string): Promise<Experiment> {
    const experiment = await this.getOwned(userId, id);
    if (experiment.status === ExperimentStatus.DECIDED) {
      throw new ConflictException('A decided experiment is history — it cannot be cancelled');
    }
    experiment.status = ExperimentStatus.CANCELLED;
    experiment.conclusion = reason || 'Cancelled without a verdict.';
    experiment.endedAt = new Date();
    return this.experimentRepository.save(experiment);
  }

  async remove(userId: string, id: string): Promise<void> {
    const experiment = await this.getOwned(userId, id);
    await this.experimentRepository.softDelete(experiment.id);
  }

  private async getOwned(userId: string, id: string): Promise<Experiment> {
    const experiment = await this.experimentRepository.findOne({ where: { id, userId } });
    if (!experiment) {
      throw new NotFoundException('Experiment with id ' + id + ' not found');
    }
    return experiment;
  }
}
