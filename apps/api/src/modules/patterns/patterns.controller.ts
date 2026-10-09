// ============================================================================
// FILE: /apps/api/src/modules/patterns/patterns.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only. Static segments declared before :id routes.

import {
  Controller, Get, Post, Delete, Body, Param, Query, Request,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PatternsService } from './patterns.service';
import { CreatePatternDto, MatchPatternsDto, LearnFromExperimentDto } from './dto/create-pattern.dto';

@Controller('patterns')
export class PatternsController {
  constructor(private readonly patternsService: PatternsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreatePatternDto) {
    return this.patternsService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('kind') kind?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.patternsService.findAll(req.user.id, {
      page: Number(page), limit: Number(limit), kind, category, search,
    });
  }

  @Post('match')
  @HttpCode(HttpStatus.OK)
  match(@Request() req: any, @Body() dto: MatchPatternsDto) {
    return this.patternsService.match(req.user.id, dto);
  }

  @Post('from-experiment/:experimentId')
  @HttpCode(HttpStatus.CREATED)
  learnFromExperiment(
    @Request() req: any,
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Body() dto: LearnFromExperimentDto,
  ) {
    return this.patternsService.learnFromExperiment(req.user.id, experimentId, dto);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.patternsService.findOne(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.patternsService.remove(req.user.id, id);
  }
}
