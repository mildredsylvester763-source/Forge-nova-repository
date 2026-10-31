// Test quality service (FORGE TQ-036..040). The pure engines own every law;
// this service persists golden files per user and refuses with the same
// named reasons the engines return. Sync wrappers throw BadRequestException
// for named refusals; the golden methods reject with the same message, and
// stored content is scoped to the requesting user so goldens are isolated
// per account.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestQualityGolden } from './entities/test-quality-golden.entity';
import { buildPact as buildPactEngine, verifyContract as verifyContractEngine } from './engine/contract-testing';
import {
  planMatrix as planMatrixEngine,
  scoreMatrix as scoreMatrixEngine,
  MATRIX_BROWSERS,
  MATRIX_PLATFORMS,
  MATRIX_STATUSES,
  MATRIX_VIEWPORTS,
} from './engine/browser-matrix';
import {
  MUTATION_OPERATORS,
  planMutants as planMutantsEngine,
  scoreMutants as scoreMutantsEngine,
} from './engine/mutation-testing';
import { manageSnapshot as manageSnapshotEngine, SNAPSHOT_MODES } from './engine/snapshot-testing';
import { diffImages as diffImagesEngine } from './engine/visual-regression';
import {
  ContractVerifyDto,
  GoldenUpdateDto,
  GoldenVerifyDto,
  GoldenWriteDto,
  MatrixPlanDto,
  MatrixScoreDto,
  MutationReportDto,
  MutationSourceDto,
  PactBuildDto,
  VisualDiffDto,
} from './dto/test-quality.dto';

@Injectable()
export class TestQualityService {
  constructor(
    @InjectRepository(TestQualityGolden)
    private readonly goldens: Repository<TestQualityGolden>,
  ) {}

  listMutationOperators(): string[] {
    return [...MUTATION_OPERATORS];
  }

  listSnapshotModes(): string[] {
    return [...SNAPSHOT_MODES];
  }

  listMatrixCatalogs() {
    return {
      browsers: [...MATRIX_BROWSERS],
      platforms: [...MATRIX_PLATFORMS],
      viewports: [...MATRIX_VIEWPORTS],
      statuses: [...MATRIX_STATUSES],
    };
  }

  planMutants(dto: MutationSourceDto) {
    const verdict = planMutantsEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  scoreMutants(dto: MutationReportDto) {
    const verdict = scoreMutantsEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  buildPact(dto: PactBuildDto) {
    const verdict = buildPactEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  verifyContract(dto: ContractVerifyDto) {
    const verdict = verifyContractEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  diffImages(dto: VisualDiffDto) {
    const verdict = diffImagesEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  planMatrix(dto: MatrixPlanDto) {
    const verdict = planMatrixEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  scoreMatrix(dto: MatrixScoreDto) {
    const verdict = scoreMatrixEngine(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict;
  }

  async writeGolden(userId: string, dto: GoldenWriteDto) {
    const row = await this.goldens.findOne({ where: { userId, name: dto.name } });
    const verdict = manageSnapshotEngine({
      name: dto.name,
      mode: 'write',
      value: dto.value,
      stored: row ? row.content : undefined,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const saved = await this.goldens.save(
      this.goldens.create({
        userId,
        name: dto.name,
        checksum: verdict.checksum ?? '',
        content: verdict.serialized ?? '',
      }),
    );
    return { id: saved.id, name: saved.name, checksum: saved.checksum, lines: verdict.lines ?? 0 };
  }

  async verifyGolden(userId: string, dto: GoldenVerifyDto) {
    const row = await this.goldens.findOne({ where: { userId, name: dto.name } });
    const verdict = manageSnapshotEngine({
      name: dto.name,
      mode: 'verify',
      value: dto.value,
      stored: row ? row.content : undefined,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return {
      name: dto.name,
      status: verdict.status ?? 'match',
      checksum: verdict.checksum ?? '',
      lines: verdict.lines ?? 0,
    };
  }

  async updateGolden(userId: string, dto: GoldenUpdateDto) {
    const row = await this.goldens.findOne({ where: { userId, name: dto.name } });
    if (!row) throw new BadRequestException('snapshot-missing:' + dto.name);
    const verdict = manageSnapshotEngine({
      name: dto.name,
      mode: 'update',
      value: dto.value,
      stored: row.content,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    row.checksum = verdict.checksum ?? '';
    row.content = verdict.serialized ?? '';
    const saved = await this.goldens.save(row);
    return { id: saved.id, name: saved.name, checksum: saved.checksum, lines: verdict.lines ?? 0 };
  }

  async listGoldens(userId: string) {
    const rows = await this.goldens.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
    return rows.map((r) => ({ id: r.id, name: r.name, checksum: r.checksum, createdAt: r.createdAt }));
  }
}
