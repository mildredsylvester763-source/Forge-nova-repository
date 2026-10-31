import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { TestQualityService } from './test-quality.service';
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

@Controller('test-quality')
export class TestQualityController {
  constructor(private readonly service: TestQualityService) {}

  @Get('mutation/operators')
  listMutationOperators() {
    return { operators: this.service.listMutationOperators() };
  }

  @Get('snapshot/modes')
  listSnapshotModes() {
    return { modes: this.service.listSnapshotModes() };
  }

  @Get('matrix/catalogs')
  listMatrixCatalogs() {
    return this.service.listMatrixCatalogs();
  }

  @Post('mutation/plan')
  planMutants(@Body() dto: MutationSourceDto) {
    return this.service.planMutants(dto);
  }

  @Post('mutation/score')
  scoreMutants(@Body() dto: MutationReportDto) {
    return this.service.scoreMutants(dto);
  }

  @Post('contract/build')
  buildPact(@Body() dto: PactBuildDto) {
    return this.service.buildPact(dto);
  }

  @Post('contract/verify')
  verifyContract(@Body() dto: ContractVerifyDto) {
    return this.service.verifyContract(dto);
  }

  @Post('golden/write')
  async writeGolden(@Request() req: { user: { id: string } }, @Body() dto: GoldenWriteDto) {
    return this.service.writeGolden(req.user.id, dto);
  }

  @Post('golden/verify')
  async verifyGolden(@Request() req: { user: { id: string } }, @Body() dto: GoldenVerifyDto) {
    return this.service.verifyGolden(req.user.id, dto);
  }

  @Post('golden/update')
  async updateGolden(@Request() req: { user: { id: string } }, @Body() dto: GoldenUpdateDto) {
    return this.service.updateGolden(req.user.id, dto);
  }

  @Get('golden/list')
  async listGoldens(@Request() req: { user: { id: string } }) {
    return this.service.listGoldens(req.user.id);
  }

  @Post('visual/diff')
  diffImages(@Body() dto: VisualDiffDto) {
    return this.service.diffImages(dto);
  }

  @Post('matrix/plan')
  planMatrix(@Body() dto: MatrixPlanDto) {
    return this.service.planMatrix(dto);
  }

  @Post('matrix/score')
  scoreMatrix(@Body() dto: MatrixScoreDto) {
    return this.service.scoreMatrix(dto);
  }
}
