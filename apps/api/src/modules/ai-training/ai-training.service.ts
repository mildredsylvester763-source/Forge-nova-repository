// ============================================================================
// FILE: /apps/api/src/modules/ai-training/ai-training.service.ts
// ============================================================================
// The training data intake pipeline (FORGE AI-001..006). Three honest
// behaviors:
//   1. Admit: a user uploads an asset (image, stroke recording, sketch,
//      finished work, correction pair, rating). It enters ONLY through the
//      gates: classification check (blocked classes never enter), consent
//      (hard gate), scrub (PII/secrets destroyed destructively, evidence
//      stored). Refusals are named — the user always learns why.
//   2. Curate: quality scores are human-labeled and stored as given.
//   3. Snapshot: eligible assets become immutable dataset versions with
//      content fingerprints and lineage chains. Identical content is
//      refused by name (the engine's immutability law).
// Zero-trust scoping on every query — one user's training data is never
// visible to another.

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TrainingAsset, TrainingAssetKind } from './entities/training-asset.entity';
import { TrainingDataset } from './entities/training-dataset.entity';
import {
  buildSnapshot,
  DatasetItem,
  DatasetRecord,
} from './engine/dataset-snapshot';
import {
  checkClassificationEligibility,
  scrubText,
} from './engine/scrub-engine';
import { CreateTrainingAssetDto, BuildDatasetDto } from './dto/ai-training.dto';

@Injectable()
export class AiTrainingService {
  constructor(
    @InjectRepository(TrainingAsset)
    private readonly assetRepository: Repository<TrainingAsset>,
    @InjectRepository(TrainingDataset)
    private readonly datasetRepository: Repository<TrainingDataset>,
  ) {}

  // --- 1. Admit an asset through the gates (AI-002/003/004) ---
  async createAsset(userId: string, dto: CreateTrainingAssetDto): Promise<TrainingAsset> {
    if (dto.consent !== true) {
      throw new BadRequestException(
        'Consent is a hard gate: an asset without consent never enters training data (reason: dataset-item-without-consent).',
      );
    }
    const classification = checkClassificationEligibility({
      classification: dto.classification,
    });
    if (!classification.ok) {
      throw new BadRequestException(
        'This asset cannot enter training data (reason: ' + classification.reason + ').',
      );
    }
    let description: string | null = null;
    let scrubFindings: Record<string, any>[] | null = null;
    let scrubRedactions = 0;
    if (dto.description && dto.description.trim().length > 0) {
      const scrub = scrubText({ text: dto.description });
      if (!scrub.ok) {
        throw new BadRequestException(
          'The description was refused by the scrubber (reason: ' + scrub.reason + ').',
        );
      }
      description = scrub.value.scrubbed;
      scrubFindings = scrub.value.findings;
      scrubRedactions = scrub.value.totalRedactions;
    }
    const asset = this.assetRepository.create({
      userId,
      kind: dto.kind,
      classification: dto.classification,
      consent: dto.consent,
      quality: dto.quality ?? 0,
      title: dto.title.trim(),
      description,
      storageKey: dto.storageKey?.trim() || null,
      scrubFindings,
      scrubRedactions,
      tags: (dto.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      eligible: true,
    });
    return this.assetRepository.save(asset);
  }

  async listAssets(
    userId: string,
    options: { kind?: string; eligible?: boolean; search?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: TrainingAsset[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.kind && Object.values(TrainingAssetKind).includes(options.kind as TrainingAssetKind)) {
      where.kind = options.kind;
    }
    if (typeof options.eligible === 'boolean') where.eligible = options.eligible;
    if (options.search) where.title = options.search;
    const [data, total] = await this.assetRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getAsset(userId: string, id: string): Promise<TrainingAsset> {
    const asset = await this.assetRepository.findOne({ where: { id, userId } });
    if (!asset) throw new NotFoundException('Training asset with id ' + id + ' not found');
    return asset;
  }

  // AI-140: deletion carries into future datasets — assets are soft-deleted,
  // so any future snapshot (which reads only live assets) excludes them
  // automatically. The dataset snapshots that already consumed the asset
  // remain frozen evidence of what was trained on, and when.
  async removeAsset(userId: string, id: string): Promise<void> {
    const asset = await this.getAsset(userId, id);
    await this.assetRepository.softDelete(asset.id);
  }

  // --- 2. Snapshot eligible assets into an immutable dataset version (AI-005/006) ---
  async buildDataset(userId: string, dto: BuildDatasetDto): Promise<TrainingDataset> {
    const tags = (dto.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const assets = await this.assetRepository.find({
      where: { userId, eligible: true },
      order: { createdAt: 'ASC' },
    });
    const filtered = tags.length > 0
      ? assets.filter((a) => (a.tags || []).some((t) => tags.includes(t)))
      : assets;
    if (filtered.length === 0) {
      throw new BadRequestException(
        'No eligible training assets match this dataset request (reason: dataset-no-items).',
      );
    }

    // Parent resolution: explicit parent, else the latest snapshot of the name.
    let parentRow: TrainingDataset | null = null;
    if (dto.parentSnapshotId) {
      parentRow = await this.datasetRepository.findOne({
        where: { id: dto.parentSnapshotId, userId },
      });
      if (!parentRow) {
        throw new NotFoundException(
          'Parent dataset snapshot ' + dto.parentSnapshotId + ' not found',
        );
      }
    } else {
      const existing = await this.datasetRepository.find({
        where: { userId, name: dto.name },
        order: { version: 'DESC' },
        take: 1,
      });
      parentRow = existing[0] ?? null;
    }

    const parentRecord: DatasetRecord | null = parentRow
      ? {
          id: parentRow.id,
          items: [],
          version: parentRow.version,
          createdAt: parentRow.createdAt.toISOString(),
          lineage: {
            parentId: parentRow.parentSnapshotId,
            parentVersion: parentRow.parentVersion,
          },
          fingerprint: parentRow.fingerprint,
        }
      : null;

    // Engine consumes per-item content truth — id, kind, classification,
    // consent, quality, tags — so the fingerprint pins the exact membership.
    const items: DatasetItem[] = filtered.map((a) => ({
      id: a.id,
      kind: a.kind as DatasetItem['kind'],
      classification: a.classification as DatasetItem['classification'],
      consent: a.consent,
      quality: a.quality,
      tags: a.tags || [],
    }));

    // Reconstruct the parent's fingerprint from its frozen membership so
    // unchanged-content refusals compare content to content, never guesswork.
    if (parentRow) {
      const parentAssets = await this.assetRepository.find({
        where: { id: In(parentRow.itemIds), userId },
        withDeleted: true,
        order: { createdAt: 'ASC' },
      });
      const byId = new Map(parentAssets.map((a) => [a.id, a]));
      const parentItems: DatasetItem[] = (parentRow.itemIds ?? [])
        .map((iid: string) => byId.get(iid))
        .filter((a): a is TrainingAsset => Boolean(a))
        .map((a) => ({
          id: a.id,
          kind: a.kind as DatasetItem['kind'],
          classification: a.classification as DatasetItem['classification'],
          consent: a.consent,
          quality: a.quality,
          tags: a.tags || [],
        }));
      if (parentItems.length === (parentRow.itemIds ?? []).length) {
        parentRecord!.items = parentItems;
      }
    }

    const snap = buildSnapshot({
      id: dto.name,
      items,
      parent: parentRecord,
      now: new Date().toISOString(),
    });
    if (!snap.ok) {
      if (snap.reason === 'dataset-unchanged-content') {
        throw new ConflictException(
          'This dataset content is unchanged from version ' +
            (parentRow ? String(parentRow.version) : 'the parent') +
            ' — an identical snapshot is refused (reason: ' + snap.reason + ').',
        );
      }
      throw new BadRequestException(
        'The dataset was refused (reason: ' + snap.reason + ').',
      );
    }

    const kinds: Record<string, number> = {};
    let qualitySum = 0;
    for (const it of items) {
      kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
      qualitySum += it.quality;
    }
    const summary = {
      kinds,
      averageQuality: Math.round((qualitySum / items.length) * 10) / 10,
      publicCount: items.filter((i) => i.classification === 'public').length,
      privateCount: items.filter((i) => i.classification === 'private').length,
      filterTags: tags,
    };

    const row = this.datasetRepository.create({
      userId,
      name: dto.name.trim(),
      version: snap.value.version,
      fingerprint: snap.value.fingerprint,
      itemIds: items.map((i) => i.id),
      itemCount: items.length,
      parentSnapshotId: parentRow ? parentRow.id : null,
      parentVersion: parentRow ? parentRow.version : null,
      summary,
    });
    return this.datasetRepository.save(row);
  }

  async listDatasets(
    userId: string,
    options: { name?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: TrainingDataset[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where: any = { userId };
    if (options.name) where.name = options.name.trim();
    const [data, total] = await this.datasetRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getDataset(userId: string, id: string): Promise<TrainingDataset> {
    const row = await this.datasetRepository.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Training dataset with id ' + id + ' not found');
    return row;
  }
}
