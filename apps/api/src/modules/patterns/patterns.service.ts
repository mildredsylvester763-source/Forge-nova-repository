// ============================================================================
// FILE: /apps/api/src/modules/patterns/patterns.service.ts
// ============================================================================
// Cross-business knowledge transfer (Feature 43) on top of the historical
// success/failure pattern library (Feature 10). Three honest behaviors:
//   1. Curate: the user writes down what worked and what did not.
//   2. Match: before pursuing anything new, the library is consulted —
//      relevance-scored by the pure engine, reasons included.
//   3. Distill: a DECIDED experiment becomes a pattern automatically —
//      win or lose, the learning is captured instead of evaporating.
// Zero-trust scoping on every query, same discipline as every module.

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Pattern, PatternKind } from './entities/pattern.entity';
import { matchPatterns } from './engine/pattern-match';
import { CreatePatternDto, MatchPatternsDto, LearnFromExperimentDto } from './dto/create-pattern.dto';
import { Experiment, ExperimentStatus, ExperimentVerdict } from '../experiments/entities/experiment.entity';

@Injectable()
export class PatternsService {
  constructor(
    @InjectRepository(Pattern)
    private readonly patternRepository: Repository<Pattern>,
    @InjectRepository(Experiment)
    private readonly experimentRepository: Repository<Experiment>,
  ) {}

  async create(userId: string, dto: CreatePatternDto): Promise<Pattern> {
    const pattern = this.patternRepository.create({
      userId,
      kind: dto.kind === 'success' ? PatternKind.SUCCESS : PatternKind.FAILURE,
      title: dto.title.trim(),
      category: dto.category.trim().toLowerCase(),
      source: dto.source?.trim().toLowerCase() || null,
      summary: dto.summary.trim(),
      evidence: dto.evidence || null,
      tags: (dto.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean),
    });
    return this.patternRepository.save(pattern);
  }

  async findAll(
    userId: string,
    options: { kind?: string; category?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: Pattern[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.kind === 'success' || options.kind === 'failure') where.kind = options.kind;
    if (options.category) where.category = options.category.trim().toLowerCase();
    if (options.search) where.title = ILike('%' + options.search + '%');
    const [data, total] = await this.patternRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(userId: string, id: string): Promise<Pattern> {
    return this.getOwned(userId, id);
  }

  // Feature 43: consult the library before pursuing anything new. Relevance
  // ranking and reasons come from the pure engine — this method only gathers
  // the user's own patterns (never another user's) and hands them over.
  async match(userId: string, dto: MatchPatternsDto): Promise<{
    context: { category: string; source: string | null; tags: string[] };
    matches: ReturnType<typeof matchPatterns>;
  }> {
    const patterns = await this.patternRepository.find({ where: { userId } });
    const context = {
      category: dto.category.trim().toLowerCase(),
      source: dto.source?.trim().toLowerCase() || null,
      tags: (dto.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean),
    };
    const matches = matchPatterns(context, patterns.map(p => ({
      id: p.id,
      kind: p.kind as 'success' | 'failure',
      title: p.title,
      category: p.category,
      source: p.source,
      tags: p.tags || [],
      summary: p.summary,
    })));
    return { context, matches };
  }

  // Distillation: a decided experiment is knowledge; this makes it durable.
  // Only a WIN or a LOSE carries a transferable lesson — an INCONCLUSIVE
  // verdict learned about the traffic, not the offer, so it is refused
  // rather than recorded as a fake success/failure.
  async learnFromExperiment(userId: string, experimentId: string, dto: LearnFromExperimentDto): Promise<Pattern> {
    const experiment = await this.experimentRepository.findOne({ where: { id: experimentId, userId } });
    if (!experiment) throw new NotFoundException('Experiment with id ' + experimentId + ' not found');
    if (experiment.status !== ExperimentStatus.DECIDED) {
      throw new ConflictException(
        'Experiment ' + experimentId + ' is ' + experiment.status + ' — only a decided experiment carries a transferable lesson.',
      );
    }
    if (experiment.verdict === ExperimentVerdict.INCONCLUSIVE || !experiment.verdict) {
      throw new ConflictException(
        'Experiment ' + experimentId + ' ended inconclusive — nothing was learned about the hypothesis itself.',
      );
    }

    const kind = experiment.verdict === ExperimentVerdict.WIN ? PatternKind.SUCCESS : PatternKind.FAILURE;
    const reasons: string[] = (experiment.evaluation as any)?.reasons || [];
    const conclusion = experiment.conclusion || reasons.join(' ') || 'No conclusion was recorded.';

    const pattern = this.patternRepository.create({
      userId,
      kind,
      title: (experiment.name || 'Experiment') + ': ' + (kind === PatternKind.SUCCESS ? 'hypothesis held' : 'hypothesis failed'),
      category: dto.category.trim().toLowerCase(),
      source: null,
      summary: conclusion,
      evidence: {
        experimentId: experiment.id,
        hypothesis: experiment.hypothesis,
        learningGoal: experiment.learningGoal,
        successMetric: experiment.successMetric,
        successThreshold: experiment.successThreshold,
        verdict: experiment.verdict,
        evaluation: experiment.evaluation,
      },
      tags: (dto.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean),
      experimentId: experiment.id,
    });
    return this.patternRepository.save(pattern);
  }

  async remove(userId: string, id: string): Promise<void> {
    const pattern = await this.getOwned(userId, id);
    await this.patternRepository.softDelete(pattern.id);
  }

  private async getOwned(userId: string, id: string): Promise<Pattern> {
    const pattern = await this.patternRepository.findOne({ where: { id, userId } });
    if (!pattern) throw new NotFoundException('Pattern with id ' + id + ' not found');
    return pattern;
  }
}
