import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceContentItem } from './entities/workspace-content-item.entity';
import { ResearchReport } from './entities/research-report.entity';
import { LIBRARY_CATALOG, searchLibraryDocs as runLibraryDocsSearch } from './engine/library-docs';
import {
  RETRIEVAL_SOURCES,
  searchWorkspaceContent as runWorkspaceSearch,
} from './engine/workspace-retrieval';
import { HYBRID_LANES, hybridSearch as runHybridSearch } from './engine/hybrid-search';
import { rerank as runRerank } from './engine/result-rerank';
import {
  RESEARCH_STEPS,
  buildResearchReport as runBuildReport,
  planResearch as runPlanResearch,
} from './engine/research-mode';
import {
  HybridSearchDto,
  LibraryDocsSearchDto,
  RecordContentItemsDto,
  RerankDto,
  ResearchPlanDto,
  ResearchReportDto,
  WorkspaceSearchDto,
} from './dto/workspace-retrieval.dto';

// Workspace retrieval service (FORGE AI-062..066). Versioned library docs,
// per-user workspace retrieval, hybrid keyword vector graph fusion, MMR
// re-ranking and multi-step research with recorded reports. All scoring lives
// in the pure engines; this service owns persistence, per-user isolation and
// named refusals. Research reports are only ever RECORDED, never claimed
// published anywhere. Every refusal is a named BadRequestException.

@Injectable()
export class WorkspaceRetrievalService {
  constructor(
    @InjectRepository(WorkspaceContentItem)
    private readonly items: Repository<WorkspaceContentItem>,
    @InjectRepository(ResearchReport)
    private readonly reports: Repository<ResearchReport>,
  ) {}

  listLibraryCatalog() {
    return LIBRARY_CATALOG.map((l) => ({ name: l.name, versions: [...l.versions] }));
  }

  listRetrievalSources() {
    return [...RETRIEVAL_SOURCES];
  }

  listHybridLanes() {
    return [...HYBRID_LANES];
  }

  listResearchSteps() {
    return [...RESEARCH_STEPS];
  }

  searchLibraryDocs(dto: LibraryDocsSearchDto) {
    const verdict = runLibraryDocsSearch(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      library: verdict.library,
      version: verdict.version,
      results: verdict.results ?? [],
    };
  }

  private async loadItemIds(userId: string): Promise<Set<string>> {
    const rows = await this.items.find({ where: { userId } });
    return new Set(rows.map((r) => r.id));
  }

  async recordContentItems(userId: string, dto: RecordContentItemsDto) {
    const list = Array.isArray(dto?.items) ? dto.items : [];
    if (list.length === 0) {
      throw new BadRequestException('items-empty');
    }
    if (list.length > 200) {
      throw new BadRequestException('items-count-invalid:' + list.length);
    }
    const ownIds = await this.loadItemIds(userId);
    const pending: WorkspaceContentItem[] = [];
    for (const raw of list) {
      const source = typeof raw?.source === 'string' ? raw.source.trim().toLowerCase() : '';
      if (!RETRIEVAL_SOURCES.includes(source)) {
        throw new BadRequestException(
          'item-source-unknown:' +
            (typeof raw?.source === 'string' ? raw.source.trim() : String(raw?.source)),
        );
      }
      const title = typeof raw?.title === 'string' ? raw.title : '';
      if (title.trim().length === 0) {
        throw new BadRequestException('item-title-missing');
      }
      if (title.length > 500) {
        throw new BadRequestException('item-title-too-long');
      }
      const body = typeof raw?.body === 'string' ? raw.body : '';
      if (body.trim().length === 0) {
        throw new BadRequestException('item-body-missing');
      }
      if (body.length > 5000) {
        throw new BadRequestException('item-body-too-long');
      }
      let links: string[] = [];
      if (raw?.links !== undefined && raw?.links !== null) {
        if (!Array.isArray(raw.links)) {
          throw new BadRequestException('item-links-not-array');
        }
        if (raw.links.length > 50) {
          throw new BadRequestException('item-links-too-many');
        }
        for (const link of raw.links) {
          if (typeof link !== 'string' || link.trim().length === 0) {
            throw new BadRequestException('item-link-missing');
          }
          if (!ownIds.has(link)) {
            throw new BadRequestException('item-link-unknown:' + link);
          }
          links.push(link);
        }
      }
      pending.push(this.items.create({ userId, source, title, body, links }));
    }
    const rows: WorkspaceContentItem[] = [];
    for (const row of pending) {
      const stored = await this.items.save(row);
      rows.push(stored);
      ownIds.add(stored.id);
    }
    return { recorded: rows.length, items: rows };
  }

  async listContentItems(userId: string, limit?: string) {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.items.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: n,
    });
  }

  async searchWorkspace(userId: string, dto: WorkspaceSearchDto) {
    const rows = await this.items.find({ where: { userId }, take: 1000 });
    const items = rows.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      body: r.body,
    }));
    const verdict = runWorkspaceSearch({
      items,
      query: dto?.query,
      sources: dto?.sources,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return { hits: verdict.hits ?? [] };
  }

  async hybridSearchWorkspace(userId: string, dto: HybridSearchDto) {
    const rows = await this.items.find({ where: { userId }, take: 1000 });
    const docs = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      links: r.links ?? [],
    }));
    const verdict = runHybridSearch({
      docs,
      query: dto?.query,
      lanes: dto?.lanes,
      weights: dto?.weights,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return { hits: verdict.hits ?? [] };
  }

  async rerankResults(dto: RerankDto) {
    const verdict = runRerank(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      removedDuplicates: verdict.removedDuplicates ?? 0,
      results: verdict.results ?? [],
    };
  }

  async planResearch(dto: ResearchPlanDto) {
    const verdict = runPlanResearch(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      topic: verdict.topic,
      steps: verdict.steps ?? [],
      stepCount: verdict.stepCount ?? 0,
    };
  }

  async buildReport(userId: string, dto: ResearchReportDto) {
    const verdict = runBuildReport({
      topic: dto?.topic,
      findings: dto?.findings,
      openQuestions: dto?.openQuestions,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const row = await this.reports.save(
      this.reports.create({
        userId,
        topic: verdict.topic ?? '',
        summary: verdict.summary ?? '',
        findings: verdict.findings ?? [],
        verifiedCount: verdict.verifiedCount ?? 0,
        unverifiedCount: verdict.unverifiedCount ?? 0,
        openQuestions: verdict.openQuestions ?? [],
      }),
    );
    return {
      id: row.id,
      topic: row.topic,
      summary: row.summary,
      findings: row.findings,
      verifiedCount: row.verifiedCount,
      unverifiedCount: row.unverifiedCount,
      openQuestions: row.openQuestions,
      createdAt: row.createdAt,
    };
  }

  async listResearchReports(userId: string, limit?: string) {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.reports.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: n,
    });
  }

  async getResearchReport(userId: string, id: string) {
    const row = await this.reports.findOne({ where: { userId, id } });
    if (!row) {
      throw new BadRequestException('research-report-not-found:' + id);
    }
    return row;
  }
}
