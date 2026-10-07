// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunities.service.ts
// ============================================================================

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  In,
  Not,
  MoreThan,
  LessThan,
  Between,
  ILike,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityHistory } from './entities/opportunity-history.entity';
import { OpportunityScan } from './entities/opportunity-scan.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityQueryDto } from './dto/opportunity-query.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { computeScore } from './scoring/scoring.service';
import { mapSignalsToSubScores } from './scoring/signal-mapper';
import {
  OpportunitySource,
  OpportunityStatus,
  OpportunityCategory,
  OpportunityPriority,
} from './enums';
import { EgressGatewayService } from '../../egress/egress-gateway.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(OpportunityHistory)
    private readonly opportunityHistoryRepository: Repository<OpportunityHistory>,
    @InjectRepository(OpportunityScan)
    private readonly opportunityScanRepository: Repository<OpportunityScan>,
    private readonly egressGateway: EgressGatewayService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateOpportunityDto): Promise<Opportunity> {
    const opportunity = this.opportunityRepository.create({
      ...dto,
      userId,
      accountId: userId,
    });
    const saved = await this.opportunityRepository.save(opportunity);

    await this.createHistory(saved.id, userId, 'CREATE', {
      action: 'create',
      by: userId,
      changes: dto,
    });

    return saved;
  }

  async findAll(
    userId: string,
    query?: OpportunityQueryDto,
  ): Promise<{ data: Opportunity[]; total: number }> {
    const where: any = { userId, accountId: userId };

    if (query) {
      if (query.category) where.category = query.category;
      if (query.source) where.source = query.source;
      if (query.status) where.status = query.status;
      if (query.priority) where.priority = query.priority;
      if (query.riskLevel) where.riskLevel = query.riskLevel;

      if (query.search) {
        const searchField = this.configService.get<string>('database.searchField') || 'title';
        where[searchField] = ILike('%' + query.search + '%');
      }
    }

    const [data, total] = await this.opportunityRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query?.skip || 0,
      take: query?.take || 50,
    });

    return { data, total };
  }

  async findOne(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
      relations: ['histories', 'scans', 'user'],
    });

    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    if (request) {
      await this.createHistory(
        id,
        userId,
        'ACCESS',
        { action: 'view', accessedAt: new Date().toISOString() },
        request,
      );
    }

    return opportunity;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateOpportunityDto,
    request?: any,
  ): Promise<Opportunity> {
    const existing = await this.opportunityRepository.findOne({
      where: { id, userId },
      relations: ['user'],
    });

    if (!existing) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    const oldValues = this.sanitizeForHistory(existing);
    this.opportunityRepository.merge(existing, {
      ...dto,
      updatedBy: userId,
      version: (existing.version || 0) + 1,
    });

    const saved = await this.opportunityRepository.save(existing);
    const changes: any = { oldValues: {}, newValues: {} };

    for (const key of Object.keys(dto)) {
      const newValue = (dto as any)[key];
      if (
        newValue !== undefined &&
        JSON.stringify(newValue) !== JSON.stringify(oldValues[key])
      ) {
        changes.oldValues[key] = oldValues[key];
        changes.newValues[key] = newValue;
      }
    }

    if (Object.keys(changes.oldValues).length) {
      await this.createHistory(id, userId, 'UPDATE', changes, request);
    }

    return saved;
  }

  async remove(userId: string, id: string, request?: any): Promise<void> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    await this.opportunityRepository.softDelete(id);
    await this.createHistory(
      id,
      userId,
      'DELETE',
      { oldValues: this.sanitizeForHistory(opportunity), newValues: null },
      request,
    );
  }

  async restore(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
      withDeleted: true,
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }

    await this.opportunityRepository.restore(id);
    await this.createHistory(
      id,
      userId,
      'RESTORE',
      { oldValues: null, newValues: this.sanitizeForHistory(opportunity) },
      request,
    );

    return opportunity;
  }

  async changeStatus(
    userId: string,
    id: string,
    newStatus: OpportunityStatus,
    reason?: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldStatus = opportunity.status;

    opportunity.status = newStatus;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const now = new Date();
    switch (newStatus) {
      case OpportunityStatus.VALIDATING:
        opportunity.validatedAt = now;
        break;
      case OpportunityStatus.APPROVED:
        opportunity.approvedAt = now;
        break;
      case OpportunityStatus.GTM_LAUNCHING:
      case OpportunityStatus.OPERATIONS_ACTIVE:
        opportunity.launchedAt = now;
        break;
      case OpportunityStatus.KILLED:
        opportunity.killedAt = now;
        break;
      case OpportunityStatus.RETIRED:
        opportunity.retiredAt = now;
        break;
      case OpportunityStatus.PAUSING:
        opportunity.pausedAt = now;
        break;
    }

    const saved = await this.opportunityRepository.save(opportunity);
    await this.createHistory(id, userId, 'STATUS_CHANGE', {
      oldStatus,
      newStatus,
      reason,
    }, request);

    return saved;
  }

  async changePriority(
    userId: string,
    id: string,
    newPriority: OpportunityPriority,
    reason?: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldPriority = opportunity.priority;

    opportunity.priority = newPriority;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.createHistory(id, userId, 'PRIORITY_CHANGE', {
      oldPriority,
      newPriority,
      reason,
    }, request);

    return saved;
  }

  async calculateScore(opportunity: Opportunity): Promise<number> {
    // Single source of truth: the pure engine in ./scoring. The old local
    // weights drifted from it — two engines meant two different answers for
    // the same opportunity, and updateScore/recalculateAllScores could
    // disagree with POST :id/score. Now they cannot, structurally.
    const num = (v: any): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    return computeScore({
      demand: num(opportunity.demandScore),
      competition: num(opportunity.competitionScore),
      profitability: num(opportunity.profitabilityScore),
      feasibility: num(opportunity.feasibilityScore),
      trend: num(opportunity.trendScore),
      seasonality: num(opportunity.seasonalityScore),
    }).composite;
  }

  async updateScore(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldScore = opportunity.score;
    const newScore = await this.calculateScore(opportunity);

    opportunity.score = newScore;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.createHistory(id, userId, 'SCORE_CHANGE', {
      oldScore,
      newScore,
    }, request);

    return saved;
  }

  async recalculateAllScores(
    userId: string,
    request?: any,
  ): Promise<{ updated: number; total: number }> {
    const opportunities = await this.opportunityRepository.find({ where: { userId } });
    let updated = 0;

    for (const opportunity of opportunities) {
      const oldScore = opportunity.score;
      const newScore = await this.calculateScore(opportunity);

      if (oldScore !== newScore) {
        opportunity.score = newScore;
        opportunity.updatedBy = userId;
        opportunity.version = (opportunity.version || 0) + 1;
        await this.opportunityRepository.save(opportunity);

        await this.createHistory(opportunity.id, userId, 'SCORE_CHANGE', {
          oldScore,
          newScore,
          batchUpdate: true,
        }, request);

        updated++;
      }
    }

    return { updated, total: opportunities.length };
  }

  // ─── Scoring engine (pure core in ./scoring) ────────────────────────────
  // Computes the composite 0-100 from the six sub-scores, persists it with a
  // full explanation (factors, weights, missing signals), and returns both.
  // Missing sub-scores degrade to the neutral default and are listed —
  // never faked as real data.
  async scoreOpportunity(userId: string, id: string): Promise<any> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity ${id} not found for this user`);
    }
    // Decimal columns come back as strings; null/undefined must stay
    // "missing" (not Number(null) === 0).
    const num = (v: any): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const result = computeScore({
      demand: num(opportunity.demandScore),
      competition: num(opportunity.competitionScore),
      profitability: num(opportunity.profitabilityScore),
      feasibility: num(opportunity.feasibilityScore),
      trend: num(opportunity.trendScore),
      seasonality: num(opportunity.seasonalityScore),
    });
    opportunity.score = result.composite;
    opportunity.metadata = {
      ...(opportunity.metadata || {}),
      scoring: { ...result, computedAt: new Date().toISOString() },
    };
    const saved = await this.opportunityRepository.save(opportunity);
    return { ...result, opportunity: saved };
  }

  async createScan(
    userId: string,
    dto: CreateScanDto,
    request?: any,
  ): Promise<OpportunityScan> {
    // maxSignals has no dedicated column — pull it out of the DTO before
    // create() so it never lands on the entity as a stray property, then
    // stash it into parameters so the budget survives reloads.
    const { maxSignals, ...scanFields } = dto;
    const scan = this.opportunityScanRepository.create({
      ...scanFields,
      userId,
      createdBy: userId,
      id: randomUUID(),
      status: dto.runImmediately ? 'running' : 'pending',
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      // maxSignals has no dedicated column (it arrives via ...dto but is
      // not persisted); stash it into parameters so the budget survives
      // reloads and the scanner can enforce it.
      parameters: maxSignals
        ? { ...(dto.parameters || {}), maxSignals }
        : dto.parameters,
    });

    const saved = await this.opportunityScanRepository.save(scan);

    if (dto.runImmediately) {
      this.runScan(saved, userId, request).catch((error: any) => {
        this.logger.error(`Error running scan ${saved.id}: ${error.message}`, error.stack);
      });
    }

    return saved;
  }

  async runScan(
    scan: OpportunityScan,
    userId: string,
    _request?: any,
  ): Promise<OpportunityScan> {
    scan.status = 'running';
    scan.startedAt = new Date();
    scan.statusDetails = {
      currentStep: 'starting',
      totalSteps: 1,
      completedSteps: 0,
      progress: 0,
    };
    await this.opportunityScanRepository.save(scan);

    try {
      const results = await this.executeScan(scan, userId);

      // Some sources fetched, others failed → the run is partial, and
      // summary.failures (persisted with the scan) names exactly which.
      scan.status = results.summary?.failures?.length ? 'partial' : 'completed';
      scan.completedAt = new Date();
      scan.opportunitiesFound = results.opportunitiesFound;
      scan.opportunitiesCreated = results.opportunitiesCreated;
      scan.opportunitiesUpdated = results.opportunitiesUpdated;
      scan.summary = results.summary;
      scan.performance = results.performance;
      scan.runCount = (scan.runCount || 0) + 1;

      if (scan.parameters?.recurrence) {
        scan.nextRunAt = this.calculateNextRun(scan) ?? undefined;
      }

      await this.opportunityScanRepository.save(scan);

      if (scan.notifications?.onCompletion) {
        await this.sendScanNotification(
          scan,
          userId,
          'completion',
          `Scan "${scan.name || scan.id}" completed successfully`,
        );
      }
    } catch (error: any) {
      scan.status = 'failed';
      scan.completedAt = new Date();
      await this.opportunityScanRepository.save(scan);

      if (scan.notifications?.onFailure) {
        await this.sendScanNotification(
          scan,
          userId,
          'failure',
          `Scan "${scan.name || scan.id}" failed: ${error.message}`,
        );
      }

      this.logger.error(`Scan ${scan.id} failed: ${error.message}`, error.stack);
    }

    return scan;
  }

  private async executeScan(scan: OpportunityScan, userId: string): Promise<{
    opportunitiesFound: number;
    opportunitiesCreated: number;
    opportunitiesUpdated: number;
    summary: any;
    performance: any;
  }> {
    const startTime = Date.now();
    const summary: any = { byCategory: {}, bySource: {}, byRiskLevel: {} };

    switch (scan.source) {
      case OpportunitySource.TWITTER:
        await this.scanTwitter(scan, userId, summary);
        break;
      case OpportunitySource.REDDIT:
        await this.scanReddit(scan, userId, summary);
        break;
      case OpportunitySource.GOOGLE_TRENDS:
        await this.scanGoogleTrends(scan, userId, summary);
        break;
      case OpportunitySource.GITHUB:
        await this.scanGitHub(scan, userId, summary);
        break;
      default:
        for (const source of scan.sources || []) {
          if (source === OpportunitySource.TWITTER) await this.scanTwitter(scan, userId, summary);
          if (source === OpportunitySource.REDDIT) await this.scanReddit(scan, userId, summary);
          if (source === OpportunitySource.GOOGLE_TRENDS) await this.scanGoogleTrends(scan, userId, summary);
          if (source === OpportunitySource.GITHUB) await this.scanGitHub(scan, userId, summary);
        }
    }

    const opportunities = await this.opportunityRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    summary.scoreDistribution = this.calculateScoreDistribution(opportunities);
    summary.topOpportunities = opportunities
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map(o => ({ id: o.id, title: o.title, score: o.score, category: o.category }));

    const executionTime = Date.now() - startTime;
    const found = Object.values(summary.bySource).reduce(
      (a: number, b: any) => a + Number(b),
      0,
    );
    return {
      opportunitiesFound: found,
      // Real outcomes from the upsert layer — previously "created" was
      // always equal to "found" and "updated" was always a hard-coded 0.
      opportunitiesCreated: summary.created || 0,
      opportunitiesUpdated: summary.updated || 0,
      summary,
      performance: {
        executionTime,
        opportunitiesPerSecond:
          executionTime > 0 ? found / (executionTime / 1000) : 0,
      },
    };
  }

  private async scanTwitter(_scan: OpportunityScan, userId: string, summary: any): Promise<void> {
    try {
      const response = await this.egressGateway.getTwitterTrends(userId);
      for (const trend of (response.data as any[]) || []) {
        await this.upsertScannedOpportunity(
          userId,
          {
            title: trend.name || trend.trendName || 'Untitled Trend',
            description: trend.description || '',
            category: this.mapTwitterToCategory(trend),
            source: OpportunitySource.TWITTER,
            externalId: trend.id || trend.woeid?.toString(),
            externalUrl:
              trend.url ||
              `https://twitter.com/search?q=${encodeURIComponent(trend.name || '')}`,
            tags: trend.tags || [],
            trendData: { twitter: { mentions: trend.tweetVolume || 0, growthRate: trend.growthRate || 0 } },
          },
          summary,
        );
      }
    } catch (error: any) {
      this.logger.error(`Error scanning Twitter: ${error.message}`, error.stack);
    }
  }

  // ─── Reddit scanner (Phase A, Feature 1) ──────────────────────────────────
  // Fail-visible contract: every egress envelope is checked. A subreddit
  // that cannot be fetched is recorded in summary.failures; if NO subreddit
  // yielded data the scan throws (runScan marks it failed); partial success
  // marks the run 'partial'. The user's maxSignals budget is enforced, and
  // scores are normalized into the 0–100 domain — raw upvotes stay in
  // trendData where they belong.
  private static readonly REDDIT_DEFAULT_SUBREDDITS = [
    'Entrepreneur',
    'sideproject',
    'startups',
    'smallbusiness',
    'passiveincome',
  ];
  private static readonly REDDIT_SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{2,21}$/;
  private static readonly REDDIT_MAX_SUBREDDITS = 10;
  private static readonly REDDIT_POSTS_PER_SUBREDDIT = 25;

  private async scanReddit(
    scan: OpportunityScan,
    userId: string,
    summary: any,
  ): Promise<void> {
    // Validate and dedupe subreddit targets. Invalid names are reported as
    // warnings — never silently treated as "zero opportunities found".
    const requested = scan.parameters?.query
      ? String(scan.parameters.query).split(',')
      : [...OpportunitiesService.REDDIT_DEFAULT_SUBREDDITS];
    const valid = new Set<string>();
    const invalid: string[] = [];
    for (const entry of requested) {
      const name = entry.trim();
      if (!name) continue;
      if (!OpportunitiesService.REDDIT_SUBREDDIT_PATTERN.test(name)) {
        invalid.push(name);
        continue;
      }
      valid.add(name);
      if (valid.size >= OpportunitiesService.REDDIT_MAX_SUBREDDITS) break;
    }
    if (invalid.length) {
      summary.warnings = summary.warnings || [];
      summary.warnings.push({
        source: OpportunitySource.REDDIT,
        message: 'Invalid subreddit names skipped: ' + invalid.join(', '),
      });
    }
    const subreddits = [...valid];
    if (!subreddits.length) {
      throw new Error(
        'Reddit scan has no valid subreddit targets' +
          (invalid.length ? ' — all provided names were invalid' : ''),
      );
    }

    const signalCap = this.readSignalCap(scan);
    const seenPostIds = new Set<string>();
    let fetchedAny = false;
    let saved = 0;

    for (const subreddit of subreddits) {
      if (signalCap && saved >= signalCap) break;
      // userId is passed so the gateway's rate limiter and circuit breaker
      // are genuinely per-user: one user's scan cannot starve another's.
      const response = await this.egressGateway.getRedditHot(
        subreddit,
        OpportunitiesService.REDDIT_POSTS_PER_SUBREDDIT,
        userId,
      );
      if (!response.ok) {
        // A blocked/rate-limited/failed call is a FAILURE, not "0 posts".
        summary.failures = summary.failures || [];
        summary.failures.push({
          source: OpportunitySource.REDDIT,
          target: subreddit,
          code: response.error?.code,
          message: response.error?.message,
        });
        continue;
      }
      fetchedAny = true;
      for (const post of response.data?.data?.children || []) {
        if (signalCap && saved >= signalCap) break;
        const data = post?.data;
        // NSFW and moderator-pinned posts are not opportunities.
        if (!data || data.over_18 || data.stickied) continue;
        // Cross-subreddit dedupe: the same post can appear in several subs.
        if (!data.id || seenPostIds.has(data.id)) continue;
        seenPostIds.add(String(data.id));

        const upvotes = Number(data.ups ?? data.score ?? 0);
        const comments = Number(data.num_comments ?? 0);
        await this.upsertScannedOpportunity(
          userId,
          {
            title: String(data.title || 'Untitled Reddit post'),
            description: data.selftext || '',
            category: this.mapRedditToCategory(data, subreddit),
            source: OpportunitySource.REDDIT,
            externalId: String(data.id),
            externalUrl: 'https://www.reddit.com' + data.permalink,
            tags: Array.isArray(data.tags) ? data.tags : [],
            score: this.normalizeRedditEngagement(upvotes, comments),
            trendData: {
              reddit: {
                posts: 1,
                comments,
                upvotes,
                growthRate:
                  typeof data.upvote_ratio === 'number'
                    ? (data.upvote_ratio - 0.5) * 100
                    : 0,
              },
            },
          },
          summary,
        );
        saved += 1;
      }
    }

    if (!fetchedAny) {
      // Every subreddit failed to fetch — this is a failed scan, not a
      // completed scan that "found nothing".
      const detail = (summary.failures || [])
        .map((f: any) => f.target + ': ' + (f.code || 'unknown'))
        .join('; ');
      throw new Error(
        'Reddit scan could not fetch any subreddit' +
          (detail ? ' (' + detail + ')' : ''),
      );
    }
  }

  // Reddit engagement normalized into the 0–100 score domain:
  // 20·log10(1 + upvotes + comments). Bounded (viral posts cannot exceed
  // the column's 0–100 domain), monotonic, and explainable: ~100 upvotes ≈ 40,
  // ~1,000 ≈ 60, ~10,000 ≈ 80, ~100,000 ≈ 100.
  private normalizeRedditEngagement(upvotes: number, comments: number): number {
    const safeUpvotes = Number.isFinite(upvotes) ? Math.max(0, upvotes) : 0;
    const safeComments = Number.isFinite(comments) ? Math.max(0, comments) : 0;
    const raw = 20 * Math.log10(1 + safeUpvotes + safeComments);
    return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
  }

  // The user's declared budget from CreateScanDto. Accepted from the dto
  // property (in-memory) or scan.parameters (persisted); 0 = uncapped.
  private readSignalCap(scan: OpportunityScan): number {
    const cap = Number(
      (scan as any).maxSignals ?? scan.parameters?.maxSignals ?? 0,
    );
    return Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : 0;
  }

  private async scanGoogleTrends(scan: OpportunityScan, userId: string, summary: any): Promise<void> {
    // Same fail-visible contract as Reddit: a blocked/failed call is a
    // FAILURE recorded in summary.failures, never silently "0 results".
    const query = scan.parameters?.query || 'micro business, side hustle, passive income';
    const response = await this.egressGateway.searchGoogle(query, 10, userId);
    if (!response.ok) {
      summary.failures = summary.failures || [];
      summary.failures.push({
        source: OpportunitySource.GOOGLE_SEARCH,
        target: query,
        code: response.error?.code,
        message: response.error?.message,
      });
      return;
    }
    for (const item of response.data?.items || []) {
      await this.upsertScannedOpportunity(
        userId,
        {
          title: item.title || item.displayLink || 'Untitled',
          description: item.snippet || '',
          category: this.mapGoogleToCategory(item),
          source: OpportunitySource.GOOGLE_SEARCH,
          externalId: item.id || item.cacheId,
          externalUrl: item.link,
          tags: item.tags || [],
          trendData: {
            googleTrends: {
              interestOverTime: [],
              regionalInterest: [],
              relatedQueries: [],
              relatedTopics: [],
            },
          },
        },
        summary,
      );
    }
  }

  private async scanGitHub(scan: OpportunityScan, userId: string, summary: any): Promise<void> {
    // Same fail-visible contract as Reddit: a blocked/failed call is a
    // FAILURE recorded in summary.failures, never silently "0 results".
    const language = scan.parameters?.query || 'javascript';
    const response = await this.egressGateway.getGitHubTrending(language, 'weekly', userId);
    if (!response.ok) {
      summary.failures = summary.failures || [];
      summary.failures.push({
        source: OpportunitySource.GITHUB,
        target: language,
        code: response.error?.code,
        message: response.error?.message,
      });
      return;
    }
    for (const item of response.data?.items || []) {
      await this.upsertScannedOpportunity(
        userId,
        {
          title: item.name || item.full_name || 'Untitled Repository',
          description: item.description || '',
          category: OpportunityCategory.SOFTWARE_TOOLS,
          source: OpportunitySource.GITHUB,
          externalId: item.id?.toString(),
          externalUrl: item.html_url || item.url,
          tags: item.topics?.length ? item.topics : item.language ? [item.language] : [],
          trendData: {
            socialMedia: {
              github: {
                stars: item.stargazers_count || 0,
                forks: item.forks_count || 0,
                issues: item.open_issues_count || 0,
                growthRate:
                  item.stargazers_count > 100
                    ? 10
                    : (item.stargazers_count || 0) / 10,
              },
            },
          },
        },
        summary,
      );
    }
  }

  private async upsertScannedOpportunity(
    userId: string,
    data: any,
    summary: any,
  ): Promise<'created' | 'updated'> {
    const incoming = this.opportunityRepository.create({
      ...data,
      userId,
      accountId: userId,
      status: OpportunityStatus.DISCOVERED,
      priority: data.priority || OpportunityPriority.MEDIUM,
      discoveredAt: data.discoveredAt || new Date(),
      createdBy: userId,
      updatedBy: userId,
    }) as unknown as Opportunity;

    // Auto-scoring (Feature 2 closed-loop): every scanned signal is scored
    // by the pure engine the moment it lands. Only real signals produce
    // sub-scores; everything else stays missing and is listed, never faked.
    const subScores = mapSignalsToSubScores(incoming.trendData);
    const scoring = computeScore(subScores);
    const scoringExplanation = {
      ...scoring,
      computedAt: new Date().toISOString(),
      auto: true,
    };

    const existing = await this.opportunityRepository.findOne({
      where: {
        externalId: incoming.externalId,
        source: incoming.source,
        userId,
      },
    });

    let outcome: 'created' | 'updated';
    if (existing) {
      Object.assign(existing, {
        title: incoming.title,
        description: incoming.description,
        category: incoming.category,
        externalUrl: incoming.externalUrl,
        tags: incoming.tags,
        score: incoming.score,
        trendData: incoming.trendData,
        priority: incoming.priority,
        demandScore: subScores.demand ?? existing.demandScore,
        trendScore: subScores.trend ?? existing.trendScore,
        metadata: {
          ...(existing.metadata || {}),
          scoring: scoringExplanation,
        },
        updatedAt: new Date(),
        updatedBy: userId,
        version: (existing.version || 0) + 1,
      });
      await this.opportunityRepository.save(existing);
      outcome = 'updated';
    } else {
      incoming.demandScore = subScores.demand ?? incoming.demandScore;
      incoming.trendScore = subScores.trend ?? incoming.trendScore;
      incoming.score = scoring.composite;
      incoming.metadata = {
        ...(incoming.metadata || {}),
        scoring: scoringExplanation,
      };
      await this.opportunityRepository.save(incoming);
      outcome = 'created';
    }

    summary.bySource[incoming.source] = (summary.bySource[incoming.source] || 0) + 1;
    summary.byCategory[incoming.category] = (summary.byCategory[incoming.category] || 0) + 1;
    summary.created = (summary.created || 0) + (outcome === 'created' ? 1 : 0);
    summary.updated = (summary.updated || 0) + (outcome === 'updated' ? 1 : 0);
    return outcome;
  }

  private async createHistory(
    opportunityId: string,
    userId: string,
    action:
      | 'CREATE'
      | 'UPDATE'
      | 'DELETE'
      | 'STATUS_CHANGE'
      | 'PRIORITY_CHANGE'
      | 'SCORE_CHANGE'
      | 'ACCESS'
      | 'RESTORE',
    changes: any,
    request?: any,
  ): Promise<OpportunityHistory> {
    const history = this.opportunityHistoryRepository.create({
      id: randomUUID(),
      opportunityId,
      userId,
      action,
      changes,
      oldStatus: changes.oldStatus,
      newStatus: changes.newStatus,
      oldPriority: changes.oldPriority,
      newPriority: changes.newPriority,
      oldScore: changes.oldScore,
      newScore: changes.newScore,
      reason: changes.reason,
      source: request ? 'user' : 'system',
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent'],
      metadata: changes,
      snapshot: changes.newValues || changes,
    });

    return this.opportunityHistoryRepository.save(history);
  }

  async getHistory(
    userId: string,
    opportunityId: string,
    query?: { page?: number; limit?: number },
  ): Promise<{ data: OpportunityHistory[]; total: number; page: number; limit: number }> {
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const [data, total] = await this.opportunityHistoryRepository.findAndCount({
      where: { opportunityId, userId },
      order: { changedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['opportunity', 'user'],
    });

    return { data, total, page, limit };
  }

  async getScans(
    userId: string,
    query?: { page?: number; limit?: number; status?: string },
  ): Promise<{ data: OpportunityScan[]; total: number; page: number; limit: number }> {
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const where: any = { userId };
    if (query?.status) where.status = query.status;

    const [data, total] = await this.opportunityScanRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async getScan(userId: string, id: string): Promise<OpportunityScan> {
    const scan = await this.opportunityScanRepository.findOne({ where: { id, userId } });
    if (!scan) throw new NotFoundException(`Scan with id ${id} not found`);
    return scan;
  }

  async deleteScan(userId: string, id: string): Promise<void> {
    const scan = await this.getScan(userId, id);
    await this.opportunityScanRepository.remove(scan);
  }

  async triggerScan(userId: string, id: string, request?: any): Promise<OpportunityScan> {
    const scan = await this.getScan(userId, id);
    scan.scheduledAt = new Date();
    scan.runImmediately = true;
    await this.opportunityScanRepository.save(scan);
    return this.runScan(scan, userId, request);
  }

  async getStatistics(userId: string): Promise<any> {
    const opportunities = await this.opportunityRepository.find({ where: { userId } });
    const total = opportunities.length;
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};

    let totalScore = 0;
    let minScore = total ? 100 : 0;
    let maxScore = 0;

    for (const opportunity of opportunities) {
      byCategory[opportunity.category] = (byCategory[opportunity.category] || 0) + 1;
      byStatus[opportunity.status] = (byStatus[opportunity.status] || 0) + 1;
      byPriority[opportunity.priority] = (byPriority[opportunity.priority] || 0) + 1;
      bySource[opportunity.source] = (bySource[opportunity.source] || 0) + 1;
      if (opportunity.riskLevel) {
        byRiskLevel[opportunity.riskLevel] = (byRiskLevel[opportunity.riskLevel] || 0) + 1;
      }

      totalScore += opportunity.score || 0;
      minScore = Math.min(minScore, opportunity.score || 0);
      maxScore = Math.max(maxScore, opportunity.score || 0);
    }

    return {
      total,
      byCategory,
      byStatus,
      byPriority,
      bySource,
      byRiskLevel,
      score: {
        average: total ? totalScore / total : 0,
        min: minScore,
        max: maxScore,
        distribution: this.calculateScoreDistribution(opportunities),
      },
      recent: {
        last7Days: opportunities.filter(o => o.createdAt >= new Date(Date.now() - 7 * 86400000)).length,
        last30Days: opportunities.filter(o => o.createdAt >= new Date(Date.now() - 30 * 86400000)).length,
      },
    };
  }

  private calculateScoreDistribution(opportunities: Opportunity[]): {
    min: number;
    max: number;
    average: number;
    median: number;
  } {
    const scores = opportunities.map(o => o.score || 0).filter(s => s > 0).sort((a, b) => a - b);
    if (!scores.length) return { min: 0, max: 0, average: 0, median: 0 };

    const sum = scores.reduce((a, b) => a + b, 0);
    const middle = Math.floor(scores.length / 2);
    const median =
      scores.length % 2 === 0
        ? (scores[middle - 1] + scores[middle]) / 2
        : scores[middle];

    return {
      min: scores[0],
      max: scores[scores.length - 1],
      average: sum / scores.length,
      median,
    };
  }

  async toggleFavorite(userId: string, id: string, request?: any): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldValue = opportunity.isFavorite;

    opportunity.isFavorite = !opportunity.isFavorite;
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.createHistory(id, userId, 'UPDATE', {
      oldValues: { isFavorite: oldValue },
      newValues: { isFavorite: saved.isFavorite },
    }, request);

    return saved;
  }

  async addWatcher(
    userId: string,
    id: string,
    watcherId: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldWatchers = [...(opportunity.watchers || [])];

    if (!opportunity.watchers) opportunity.watchers = [];
    if (opportunity.watchers.includes(watcherId)) return opportunity;

    opportunity.watchers.push(watcherId);
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.createHistory(id, userId, 'UPDATE', {
      oldValues: { watchers: oldWatchers },
      newValues: { watchers: saved.watchers },
    }, request);

    return saved;
  }

  async removeWatcher(
    userId: string,
    id: string,
    watcherId: string,
    request?: any,
  ): Promise<Opportunity> {
    const opportunity = await this.getOwnedOpportunity(userId, id);
    const oldWatchers = [...(opportunity.watchers || [])];

    if (!opportunity.watchers) return opportunity;

    opportunity.watchers = opportunity.watchers.filter(w => w !== watcherId);
    opportunity.updatedBy = userId;
    opportunity.version = (opportunity.version || 0) + 1;

    const saved = await this.opportunityRepository.save(opportunity);
    await this.createHistory(id, userId, 'UPDATE', {
      oldValues: { watchers: oldWatchers },
      newValues: { watchers: saved.watchers },
    }, request);

    return saved;
  }

  async bulkUpdate(
    userId: string,
    ids: string[],
    updates: Partial<UpdateOpportunityDto>,
    request?: any,
  ): Promise<{ updated: number; failed: number; errors: string[] }> {
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.update(userId, id, updates, request);
        updated++;
      } catch (error: any) {
        failed++;
        errors.push(`${id}: ${error.message}`);
      }
    }

    return { updated, failed, errors };
  }

  async bulkDelete(
    userId: string,
    ids: string[],
    request?: any,
  ): Promise<{ deleted: number; failed: number; errors: string[] }> {
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.remove(userId, id, request);
        deleted++;
      } catch (error: any) {
        failed++;
        errors.push(`${id}: ${error.message}`);
      }
    }

    return { deleted, failed, errors };
  }

  async bulkChangeStatus(
    userId: string,
    ids: string[],
    status: OpportunityStatus,
    reason?: string,
    request?: any,
  ): Promise<{ changed: number; failed: number; errors: string[] }> {
    let changed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await this.changeStatus(userId, id, status, reason, request);
        changed++;
      } catch (error: any) {
        failed++;
        errors.push(`${id}: ${error.message}`);
      }
    }

    return { changed, failed, errors };
  }

  private async sendScanNotification(
    scan: OpportunityScan,
    userId: string,
    type: 'start' | 'progress' | 'completion' | 'failure' | 'warning',
    message: string,
  ): Promise<void> {
    this.logger.log(`Notification [${type}] for ${userId}: ${message}`);
    // Persist a real, user-visible notification. Delivery failure must
    // never fail the scan — log and continue.
    try {
      await this.notifications.create(userId, {
        type: type === 'failure' ? 'scan_failed' : type === 'completion' ? 'scan_completed' : 'scan_update',
        title: `Scan ${type}: ${scan.name || scan.id}`,
        message,
        entityType: 'opportunity_scan',
        entityId: scan.id,
      });
    } catch (error: any) {
      this.logger.warn(`Notification persistence failed: ${error.message}`);
    }
    if (!scan.notificationsSent) scan.notificationsSent = [];

    scan.notificationsSent.push({
      type,
      sentAt: new Date().toISOString(),
      message,
      channel: 'in-app',
    });

    await this.opportunityScanRepository.save(scan);
  }

  private calculateNextRun(scan: OpportunityScan): Date | null {
    const recurrence = scan.parameters?.recurrence;
    if (!recurrence) return null;

    const now = new Date();
    switch (recurrence.interval) {
      case 'hour':
        return new Date(now.getTime() + 3600000);
      case 'day':
        return new Date(now.getTime() + 86400000);
      case 'week':
        return new Date(now.getTime() + 7 * 86400000);
      case 'month':
        return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      default:
        return null;
    }
  }

  private mapTwitterToCategory(trend: any): OpportunityCategory {
    const name = (trend.name || trend.trendName || '').toLowerCase();
    if (/tech|software|app/.test(name)) return OpportunityCategory.SOFTWARE_TOOLS;
    if (/fashion|clothing|style/.test(name)) return OpportunityCategory.FASHION;
    if (/food|recipe|cooking/.test(name)) return OpportunityCategory.FOOD_AND_BEVERAGE;
    if (/business|startup|entrepreneur/.test(name)) return OpportunityCategory.CONSULTING;
    if (/course|learn|education/.test(name)) return OpportunityCategory.ONLINE_COURSES;
    if (/book|ebook|read/.test(name)) return OpportunityCategory.EBOOKS;
    if (/print|3d|manufacturing/.test(name)) return OpportunityCategory.PRINT_ON_DEMAND;
    if (/service|local/.test(name)) return OpportunityCategory.LOCAL_SERVICES;
    return OpportunityCategory.DIGITAL_PRODUCTS;
  }

  private mapRedditToCategory(data: any, subreddit: string): OpportunityCategory {
    const title = (data.title || '').toLowerCase();
    const sub = subreddit.toLowerCase();
    if (/programming|coding/.test(sub) || /code|software|app/.test(title)) return OpportunityCategory.SOFTWARE_TOOLS;
    if (/entrepreneur|startups/.test(sub) || /business|startup/.test(title)) return OpportunityCategory.CONSULTING;
    if (/sideproject/.test(sub) || /side hustle|passive income/.test(title)) return OpportunityCategory.AFFILIATE_MARKETING;
    if (/etsy/.test(sub) || /craft|handmade/.test(title)) return OpportunityCategory.HANDMADE_CRAFTS;
    if (/course|learn|education/.test(title)) return OpportunityCategory.ONLINE_COURSES;
    if (/print|3d|merch/.test(title)) return OpportunityCategory.PRINT_ON_DEMAND;
    if (/service|local/.test(title)) return OpportunityCategory.LOCAL_SERVICES;
    return OpportunityCategory.DIGITAL_PRODUCTS;
  }

  private mapGoogleToCategory(item: any): OpportunityCategory {
    const title = (item.title || '').toLowerCase();
    const link = (item.displayLink || '').toLowerCase();
    if (/tech|software|app/.test(title) || /github|gitlab/.test(link)) return OpportunityCategory.SOFTWARE_TOOLS;
    if (/fashion|clothing|style/.test(title) || /etsy|shopify/.test(link)) return OpportunityCategory.FASHION;
    if (/food|recipe|cooking/.test(title)) return OpportunityCategory.FOOD_AND_BEVERAGE;
    if (/business|startup|entrepreneur/.test(title)) return OpportunityCategory.CONSULTING;
    if (/course|learn|education/.test(title) || /udemy|coursera/.test(link)) return OpportunityCategory.ONLINE_COURSES;
    if (/book|ebook|read/.test(title) || (/amazon/.test(link) && /kindle/.test(title))) return OpportunityCategory.EBOOKS;
    return OpportunityCategory.DIGITAL_PRODUCTS;
  }

  calculateRedditPriority(data: any): OpportunityPriority {
    const score = data.score || 0;
    const ratio = data.upvote_ratio || 0;
    const comments = data.num_comments || 0;
    const value = score * ratio + comments * 0.1;

    if (value > 1000) return OpportunityPriority.CRITICAL;
    if (value > 500) return OpportunityPriority.VERY_HIGH;
    if (value > 200) return OpportunityPriority.HIGH;
    if (value > 50) return OpportunityPriority.MEDIUM;
    if (value > 10) return OpportunityPriority.LOW;
    return OpportunityPriority.VERY_LOW;
  }

  calculateGitHubPriority(item: any): OpportunityPriority {
    const value = (item.stargazers_count || 0) + (item.forks_count || 0) * 0.5;
    if (value > 10000) return OpportunityPriority.CRITICAL;
    if (value > 5000) return OpportunityPriority.VERY_HIGH;
    if (value > 1000) return OpportunityPriority.HIGH;
    if (value > 100) return OpportunityPriority.MEDIUM;
    if (value > 10) return OpportunityPriority.LOW;
    return OpportunityPriority.VERY_LOW;
  }

  applyFilters(where: any, filters: any): void {
    if (filters.search) {
      where.title = ILike(`%${filters.search}%`);
    }
    if (filters.categories?.length) where.category = In(filters.categories);
    if (filters.sources?.length) where.source = In(filters.sources);
    if (filters.statuses?.length) where.status = In(filters.statuses);
    if (filters.priorities?.length) where.priority = In(filters.priorities);
    if (filters.riskLevels?.length) where.riskLevel = In(filters.riskLevels);

    if (filters.minScore !== undefined && filters.maxScore !== undefined) {
      where.score = Between(filters.minScore, filters.maxScore);
    } else if (filters.minScore !== undefined) {
      where.score = MoreThan(filters.minScore);
    } else if (filters.maxScore !== undefined) {
      where.score = LessThan(filters.maxScore);
    }

    if (filters.minDemandScore !== undefined) where.demandScore = MoreThan(filters.minDemandScore);
    if (filters.maxCompetitionScore !== undefined) where.competitionScore = LessThan(filters.maxCompetitionScore);
    if (filters.discoveredBefore) where.discoveredAt = LessThan(new Date(filters.discoveredBefore));
    if (filters.createdAfter && filters.createdBefore) {
      where.createdAt = Between(new Date(filters.createdAfter), new Date(filters.createdBefore));
    } else if (filters.createdAfter) {
      where.createdAt = MoreThan(new Date(filters.createdAfter));
    } else if (filters.createdBefore) {
      where.createdAt = LessThan(new Date(filters.createdBefore));
    }
    if (filters.updatedAfter) where.updatedAt = MoreThan(new Date(filters.updatedAfter));
    if (filters.portfolioId) where.portfolioId = filters.portfolioId;
    if (filters.businessId) where.businessId = filters.businessId;
    if (filters.isFavorite !== undefined) where.isFavorite = filters.isFavorite;
    if (filters.isArchived !== undefined) where.isArchived = filters.isArchived;
    if (filters.isHidden !== undefined) where.isHidden = filters.isHidden;
    if (filters.hasPortfolio !== undefined) where.portfolioId = filters.hasPortfolio ? Not(null) : null;
    if (filters.hasBusiness !== undefined) where.businessId = filters.hasBusiness ? Not(null) : null;
  }

  private sanitizeForHistory(opportunity: Opportunity): any {
    // Strip relation collections — history rows store a flat snapshot.
    const sanitized: any = { ...opportunity };
    delete sanitized.histories;
    delete sanitized.scans;
    return { ...sanitized, userId: opportunity.userId };
  }

  private async getOwnedOpportunity(userId: string, id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with id ${id} not found`);
    }
    return opportunity;
  }
}
