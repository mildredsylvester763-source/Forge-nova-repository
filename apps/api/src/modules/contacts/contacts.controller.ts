// ============================================================================
// FILE: /apps/api/src/modules/contacts/contacts.controller.ts
// ============================================================================

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateContactDto) {
    return this.contactsService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.contactsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.findOne(req.user.id, id);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    await this.contactsService.remove(req.user.id, id);
    return { deleted: true };
  }
}
