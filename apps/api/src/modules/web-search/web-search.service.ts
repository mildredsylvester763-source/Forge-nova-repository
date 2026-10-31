import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebSearchQuery } from './entities/web-search-query.entity';
import { DomainRule } from './entities/domain-rule.entity';
import { FetchedPage } from './entities/fetched-page.entity';
import { CitationRecord } from './entities/citation-record.entity';
import { evaluateDomain, findOverlap, validateRuleList } from './engine/domain-policy';
import { rankResults } from './engine/source-ranking';
import { extractPage } from './engine/page-extraction';
import { freshnessBand } from './engine/freshness';
import { parseSourceUrl, validateCitation } from './engine/citation';
import {
  CreateCitationDto,
  DomainRulesDto,
  FetchPageDto,
  SearchWebDto,
} from './dto/web-search.dto';

// Web search tool service (FORGE AI-057..061). The app never performs network
// I/O itself: providers supply raw results and page html, the service enforces
// the per-workspace domain policy, ranks with the pure engines, extracts and
// stores clean pages, and tracks citations with idempotent bindings. Every
// refusal is a named BadRequestException, never a silent guess.

@Injectable()
export class WebSearchService {
  constructor(
    @InjectRepository(WebSearchQuery)
    private readonly queries: Repository<WebSearchQuery>,
    @InjectRepository(DomainRule)
    private readonly rules: Repository<DomainRule>,
    @InjectRepository(FetchedPage)
    private readonly pages: Repository<FetchedPage>,
    @InjectRepository(CitationRecord)
    private readonly citations: Repository<CitationRecord>,
  ) {}

  private workspaceOf(dto: { workspace?: string }): string {
    const w = typeof dto?.workspace === 'string' ? dto.workspace.trim() : '';
    return w.length > 0 ? w.slice(0, 64) : 'default';
  }

  private async loadRules(userId: string, workspace: string): Promise<DomainRule> {
    let row = await this.rules.findOne({ where: { userId, workspace } });
    if (!row) {
      row = await this.rules.save(
        this.rules.create({ userId, workspace, allow: [], deny: [] }),
      );
    }
    return row;
  }

  async search(userId: string, dto: SearchWebDto) {
    const workspace = this.workspaceOf(dto);
    const rawResults = Array.isArray(dto?.results) ? dto.results : [];
    if (rawResults.length === 0) {
      throw new BadRequestException('search-no-results-supplied');
    }
    const rules = await this.loadRules(userId, workspace);
    const policy = { allow: rules.allow ?? [], deny: rules.deny ?? [] };

    const allowed: SearchWebDto['results'] = [];
    const skipped: { url: string; reason: string }[] = [];
    for (const r of rawResults) {
      const url = typeof r?.url === 'string' ? r.url : '';
      const parsed = url
        ? parseSourceUrl(url)
        : { ok: false as const, reason: 'rank-result-missing-url' };
      if (!parsed.ok) {
        skipped.push({ url, reason: parsed.reason });
        continue;
      }
      const verdict = evaluateDomain(parsed.source.host, policy);
      if (!verdict.ok) {
        skipped.push({ url, reason: verdict.reason ?? 'domain-refused' });
        continue;
      }
      allowed.push(r);
    }

    let ranked: unknown[] = [];
    if (allowed.length > 0) {
      const verdict = rankResults(dto.query, allowed, new Date());
      if (verdict.ok) {
        ranked = verdict.ranked;
        for (const s of verdict.skipped) skipped.push(s);
      } else {
        for (const r of allowed) skipped.push({ url: r.url, reason: verdict.reason });
      }
    }

    const refusedReason =
      ranked.length === 0
        ? allowed.length === 0
          ? 'search-no-allowed-results'
          : 'rank-no-usable-results'
        : null;

    const row = await this.queries.save(
      this.queries.create({
        userId,
        workspace,
        query: dto.query,
        results: ranked.slice(0, 50),
        skipped: skipped.slice(0, 200),
        refusedReason,
      }),
    );
    return {
      id: row.id,
      query: row.query,
      workspace: row.workspace,
      ranked,
      skipped,
      refusedReason,
      createdAt: row.createdAt,
    };
  }

  async listQueries(userId: string, limit?: string) {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.queries.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: n,
    });
  }

  async fetchPage(userId: string, dto: FetchPageDto) {
    const workspace = this.workspaceOf(dto);
    const parsed = parseSourceUrl(dto.url);
    if (!parsed.ok) throw new BadRequestException(parsed.reason);
    const rules = await this.loadRules(userId, workspace);
    const verdict = evaluateDomain(parsed.source.host, {
      allow: rules.allow ?? [],
      deny: rules.deny ?? [],
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const extraction = extractPage(dto.html);
    if (!extraction.ok) throw new BadRequestException(extraction.reason);
    const freshness = freshnessBand(extraction.page.publishedAt, new Date());
    const band = freshness.ok ? freshness.band ?? 'unknown' : 'unknown';

    const existing = await this.pages.findOne({
      where: { userId, url: parsed.source.url },
    });
    let row: FetchedPage;
    if (existing) {
      existing.domain = parsed.source.host;
      existing.title = extraction.page.title;
      existing.wordCount = extraction.page.wordCount;
      existing.content = extraction.page.text;
      existing.publishedAt = extraction.page.publishedAt
        ? new Date(extraction.page.publishedAt)
        : null;
      existing.freshnessBand = band;
      row = existing;
    } else {
      row = this.pages.create({
        userId,
        url: parsed.source.url,
        domain: parsed.source.host,
        title: extraction.page.title,
        wordCount: extraction.page.wordCount,
        content: extraction.page.text,
        publishedAt: extraction.page.publishedAt
          ? new Date(extraction.page.publishedAt)
          : null,
        freshnessBand: band,
      });
    }
    const saved = await this.pages.save(row);
    return { ...saved, reused: existing !== null };
  }

  async listPages(userId: string, limit?: string) {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.pages.find({ where: { userId }, order: { createdAt: 'DESC' }, take: n });
  }

  async createCitation(userId: string, dto: CreateCitationDto) {
    const verdict = validateCitation(dto.claim, dto.sourceUrl);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const existing = await this.citations.findOne({
      where: { userId, claimText: verdict.claim, sourceUrl: verdict.source.url },
    });
    if (existing) return { ...existing, reused: true };
    const saved = await this.citations.save(
      this.citations.create({
        userId,
        claimText: verdict.claim,
        sourceUrl: verdict.source.url,
        sourceTitle: dto.sourceTitle ?? null,
        quote: dto.quote ?? null,
      }),
    );
    return { ...saved, reused: false };
  }

  async listCitations(userId: string, limit?: string) {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.citations.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: n,
    });
  }

  async setDomainRules(userId: string, dto: DomainRulesDto) {
    const workspace = this.workspaceOf(dto);
    const allow = Array.isArray(dto?.allow) ? dto.allow : [];
    const deny = Array.isArray(dto?.deny) ? dto.deny : [];
    const allowProblem = validateRuleList(allow);
    if (allowProblem) throw new BadRequestException(allowProblem);
    const denyProblem = validateRuleList(deny);
    if (denyProblem) throw new BadRequestException(denyProblem);
    const overlap = findOverlap(allow, deny);
    if (overlap) throw new BadRequestException('rules-allow-deny-overlap:' + overlap);
    let row = await this.rules.findOne({ where: { userId, workspace } });
    if (row) {
      row.allow = allow;
      row.deny = deny;
    } else {
      row = this.rules.create({ userId, workspace, allow, deny });
    }
    return this.rules.save(row);
  }

  async getDomainRules(userId: string, workspace?: string) {
    const w =
      typeof workspace === 'string' && workspace.trim().length > 0
        ? workspace.trim().slice(0, 64)
        : 'default';
    return this.loadRules(userId, w);
  }
}
