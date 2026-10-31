import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchCacheEntry } from './entities/search-cache-entry.entity';
import { KnowledgePack } from './entities/knowledge-pack.entity';
import { separateFacts as runSeparateFacts } from './engine/fact-claims';
import { planQuotes as runPlanQuotes, QUOTE_LICENSES } from './engine/quoting-limits';
import {
  searchReferences as runSearchReferences,
  REFERENCE_LICENSES,
  REFERENCE_MEDIA,
} from './engine/reference-search';
import {
  cacheState as runCacheState,
  checkRate as runCheckRate,
  normalizeCacheKey,
} from './engine/search-cache';
import {
  scanUntrusted as runScanUntrusted,
  wrapUntrusted as runWrapUntrusted,
} from './engine/injection-defense';
import { buildKnowledgePack as runBuildPack } from './engine/offline-packs';
import {
  CacheGetDto,
  CachePutDto,
  FactsDto,
  PackBuildDto,
  QuotesDto,
  RateCheckDto,
  ReferenceSearchDto,
  ScanContentDto,
} from './dto/search-integrity.dto';

// Search integrity service (FORGE AI-067..072). Facts separated from
// claims, copyright-safe quoting, creative reference search, tiered search
// caching with token-bucket rate management, prompt-injection fences for
// fetched content, and offline knowledge packs. All scoring and selection
// live in the pure engines; this service owns persistence, per-user
// isolation and named refusals. Every refusal is a named BadRequestException.

@Injectable()
export class SearchIntegrityService {
  constructor(
    @InjectRepository(SearchCacheEntry)
    private readonly cache: Repository<SearchCacheEntry>,
    @InjectRepository(KnowledgePack)
    private readonly packs: Repository<KnowledgePack>,
  ) {}

  listQuoteLicenses() {
    return [...QUOTE_LICENSES];
  }

  listReferenceMedia() {
    return [...REFERENCE_MEDIA];
  }

  listReferenceLicenses() {
    return [...REFERENCE_LICENSES];
  }

  separateFacts(dto: FactsDto) {
    const verdict = runSeparateFacts(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      facts: verdict.facts ?? [],
      claims: verdict.claims ?? [],
      factCount: verdict.factCount ?? 0,
      claimCount: verdict.claimCount ?? 0,
    };
  }

  planQuotes(dto: QuotesDto) {
    const verdict = runPlanQuotes(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      license: verdict.license ?? '',
      quotes: verdict.quotes ?? [],
      quotedWords: verdict.quotedWords ?? 0,
    };
  }

  searchReferences(dto: ReferenceSearchDto) {
    const verdict = runSearchReferences(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return { results: verdict.results ?? [] };
  }

  checkRateLimit(dto: RateCheckDto) {
    const verdict = runCheckRate({ elapsedMinutes: dto?.elapsedMinutes });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      allowed: verdict.allowed ?? false,
      tokens: verdict.tokens ?? 0,
      capacity: verdict.capacity ?? 60,
      refillPerMinute: verdict.refillPerMinute ?? 60,
    };
  }

  async putCacheEntry(userId: string, dto: CachePutDto) {
    const keyVerdict = normalizeCacheKey(dto?.key);
    if (!keyVerdict.ok) {
      throw new BadRequestException(keyVerdict.reason);
    }
    const ttl = typeof dto?.ttlSeconds === 'number' ? dto.ttlSeconds : 300;
    const check = runCacheState({
      now: 0,
      entry: { key: keyVerdict.key ?? '', createdAt: 0, ttlSeconds: ttl, hitCount: 0 },
    });
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }
    const lane =
      typeof dto?.lane === 'string' && dto.lane.trim().length > 0
        ? dto.lane.trim().toLowerCase()
        : 'web';
    const payload = (dto?.payload ?? []) as SearchCacheEntry['payload'];
    const existing = await this.cache.findOne({
      where: { userId, cacheKey: keyVerdict.key },
    });
    if (existing) {
      existing.lane = lane;
      existing.payload = payload;
      existing.ttlSeconds = ttl;
      existing.hitCount = 0;
      const saved = await this.cache.save(existing);
      return { key: saved.cacheKey, state: 'stored', hitCount: saved.hitCount };
    }
    const row = await this.cache.save(
      this.cache.create({
        userId,
        cacheKey: keyVerdict.key,
        lane,
        payload,
        ttlSeconds: ttl,
        hitCount: 0,
      }),
    );
    return { key: row.cacheKey, state: 'stored', hitCount: row.hitCount };
  }

  async getCacheEntry(userId: string, dto: CacheGetDto) {
    const keyVerdict = normalizeCacheKey(dto?.key);
    if (!keyVerdict.ok) {
      throw new BadRequestException(keyVerdict.reason);
    }
    const row = await this.cache.findOne({
      where: { userId, cacheKey: keyVerdict.key },
    });
    if (!row) {
      throw new BadRequestException('cache-entry-not-found:' + keyVerdict.key);
    }
    const now = Math.floor(Date.now() / 1000);
    const created = Math.floor(new Date(row.createdAt).getTime() / 1000);
    const verdict = runCacheState({
      now,
      entry: {
        key: row.cacheKey,
        createdAt: created,
        ttlSeconds: row.ttlSeconds,
        hitCount: row.hitCount,
      },
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    if (verdict.state === 'expired') {
      throw new BadRequestException('cache-entry-expired:' + keyVerdict.key);
    }
    row.hitCount += 1;
    await this.cache.save(row);
    return {
      key: row.cacheKey,
      state: verdict.state,
      ageSeconds: verdict.ageSeconds ?? 0,
      hitCount: row.hitCount,
      payload: row.payload,
    };
  }

  wrapFetchedContent(dto: ScanContentDto) {
    const verdict = runWrapUntrusted(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return { wrapped: verdict.wrapped ?? '' };
  }

  scanFetchedContent(dto: ScanContentDto) {
    const verdict = runScanUntrusted(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      clean: verdict.clean ?? true,
      quarantined: verdict.quarantined ?? false,
      findings: verdict.findings ?? [],
    };
  }

  async buildKnowledgePack(userId: string, dto: PackBuildDto) {
    const verdict = runBuildPack(dto);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const row = await this.packs.save(
      this.packs.create({
        userId,
        name: verdict.name ?? '',
        topics: verdict.topics ?? [],
        sizeKb: verdict.sizeKb ?? 0,
        checksum: verdict.checksum ?? '',
        articles: (verdict.articles ?? []) as KnowledgePack['articles'],
      }),
    );
    return {
      id: row.id,
      name: row.name,
      topics: row.topics,
      sizeKb: row.sizeKb,
      checksum: row.checksum,
      articles: row.articles,
    };
  }

  async listKnowledgePacks(userId: string) {
    return this.packs.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async getKnowledgePack(userId: string, id: string) {
    const row = await this.packs.findOne({ where: { userId, id } });
    if (!row) {
      throw new BadRequestException('pack-not-found:' + id);
    }
    return row;
  }
}
