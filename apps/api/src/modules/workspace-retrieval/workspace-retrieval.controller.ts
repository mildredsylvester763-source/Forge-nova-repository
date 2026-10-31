import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { WorkspaceRetrievalService } from './workspace-retrieval.service';
import {
  HybridSearchDto,
  LibraryDocsSearchDto,
  RecordContentItemsDto,
  RerankDto,
  ResearchPlanDto,
  ResearchReportDto,
  WorkspaceSearchDto,
} from './dto/workspace-retrieval.dto';

@Controller('workspace-retrieval')
export class WorkspaceRetrievalController {
  constructor(private readonly retrieval: WorkspaceRetrievalService) {}

  @Get('library/catalog')
  async libraryCatalog() {
    return this.retrieval.listLibraryCatalog();
  }

  @Post('library/search')
  async searchLibraryDocs(@Body() dto: LibraryDocsSearchDto) {
    return this.retrieval.searchLibraryDocs(dto);
  }

  @Get('sources')
  async sources() {
    return this.retrieval.listRetrievalSources();
  }

  @Get('hybrid/lanes')
  async hybridLanes() {
    return this.retrieval.listHybridLanes();
  }

  @Get('research/steps')
  async researchSteps() {
    return this.retrieval.listResearchSteps();
  }

  @Post('items')
  async recordItems(@Request() req: any, @Body() dto: RecordContentItemsDto) {
    return this.retrieval.recordContentItems(req.user.id, dto);
  }

  @Get('items')
  async listItems(@Request() req: any, @Query('limit') limit?: string) {
    return this.retrieval.listContentItems(req.user.id, limit);
  }

  @Post('workspace/search')
  async searchWorkspace(@Request() req: any, @Body() dto: WorkspaceSearchDto) {
    return this.retrieval.searchWorkspace(req.user.id, dto);
  }

  @Post('hybrid/search')
  async hybridSearch(@Request() req: any, @Body() dto: HybridSearchDto) {
    return this.retrieval.hybridSearchWorkspace(req.user.id, dto);
  }

  @Post('rerank')
  async rerank(@Body() dto: RerankDto) {
    return this.retrieval.rerankResults(dto);
  }

  @Post('research/plan')
  async plan(@Body() dto: ResearchPlanDto) {
    return this.retrieval.planResearch(dto);
  }

  @Post('research/reports')
  async createReport(@Request() req: any, @Body() dto: ResearchReportDto) {
    return this.retrieval.buildReport(req.user.id, dto);
  }

  @Get('research/reports')
  async listReports(@Request() req: any, @Query('limit') limit?: string) {
    return this.retrieval.listResearchReports(req.user.id, limit);
  }

  @Get('research/reports/:id')
  async getReport(@Request() req: any, @Param('id') id: string) {
    return this.retrieval.getResearchReport(req.user.id, id);
  }
}
