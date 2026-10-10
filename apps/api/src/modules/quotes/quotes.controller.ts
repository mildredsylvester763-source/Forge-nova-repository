// ============================================================================
// FILE: /apps/api/src/modules/quotes/quotes.controller.ts
// ============================================================================
// Zero-trust entry points. Static segments are declared before :id routes.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.quotesService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(req.user.id, id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  send(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.markSent(req.user.id, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.accept(req.user.id, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.decline(req.user.id, id);
  }

  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  convert(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.convert(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.remove(req.user.id, id);
  }
}
