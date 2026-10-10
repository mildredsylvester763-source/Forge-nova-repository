// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/credit-notes.controller.ts
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
import { CreditNotesService } from './credit-notes.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';

@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateCreditNoteDto) {
    return this.creditNotesService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.creditNotesService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.creditNotesService.findOne(req.user.id, id);
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  apply(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.creditNotesService.apply(req.user.id, id);
  }

  @Post(':id/apply-to')
  @HttpCode(HttpStatus.OK)
  applyTo(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const raw = (req.body as { invoiceIds?: unknown })?.invoiceIds;
    const invoiceIds = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === 'string')
      : undefined;
    return this.creditNotesService.apply(req.user.id, id, invoiceIds);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  void(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.creditNotesService.voidNote(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.creditNotesService.remove(req.user.id, id);
  }
}
