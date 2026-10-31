import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { TestGenerationService } from './test-generation.service';
import {
  E2eSessionDto,
  FuzzCampaignDto,
  IntegrationGraphDto,
  PropertySuiteDto,
  UnitTestGenDto,
} from './dto/test-generation.dto';

@Controller('test-generation')
export class TestGenerationController {
  constructor(private readonly service: TestGenerationService) {}

  @Get('unit/kinds')
  listUnitKinds() {
    return { kinds: this.service.listUnitKinds() };
  }

  @Get('unit/param-types')
  listUnitParamTypes() {
    return { paramTypes: this.service.listUnitParamTypes() };
  }

  @Get('e2e/actions')
  listE2eActions() {
    return { actions: this.service.listE2eActions() };
  }

  @Get('fuzz/kinds')
  listFuzzKinds() {
    return { kinds: this.service.listFuzzKinds() };
  }

  @Get('fuzz/field-types')
  listFuzzFieldTypes() {
    return { fieldTypes: this.service.listFuzzFieldTypes() };
  }

  @Post('unit')
  async generateUnitTests(@Request() req: { user: { id: string } }, @Body() dto: UnitTestGenDto) {
    return this.service.generateUnitTests(req.user.id, dto);
  }

  @Post('integration')
  async generateIntegrationTests(
    @Request() req: { user: { id: string } },
    @Body() dto: IntegrationGraphDto,
  ) {
    return this.service.generateIntegrationTests(req.user.id, dto);
  }

  @Post('e2e')
  async generateE2eSuite(@Request() req: { user: { id: string } }, @Body() dto: E2eSessionDto) {
    return this.service.generateE2eSuite(req.user.id, dto);
  }

  @Post('property')
  async planPropertySuite(@Request() req: { user: { id: string } }, @Body() dto: PropertySuiteDto) {
    return this.service.planPropertySuite(req.user.id, dto);
  }

  @Post('fuzz')
  async runFuzzCampaign(@Request() req: { user: { id: string } }, @Body() dto: FuzzCampaignDto) {
    return this.service.runFuzzCampaign(req.user.id, dto);
  }

  @Get('suites')
  async listSuites(@Request() req: { user: { id: string } }) {
    return this.service.listSuites(req.user.id);
  }

  @Get('suites/:id')
  async getSuite(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.getSuite(req.user.id, id);
  }
}
