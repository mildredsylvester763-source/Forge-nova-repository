// ============================================================================
// FILE: /apps/api/src/modules/contacts/contacts.service.ts
// ============================================================================
// The engine decides identity; this service refuses duplicates with the
// dedupe key spelled out so the user knows exactly what collided.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { dedupeKeyFor, findDuplicate } from './engine/contact-dedupe';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
  ) {}

  async create(userId: string, dto: CreateContactDto): Promise<Contact> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('contact needs a name');
    }
    const key = dedupeKeyFor({ name: dto.name, email: dto.email });
    const existing = await this.contactRepository.find({ where: { userId } });
    if (findDuplicate(existing.map((c) => ({ dedupeKey: c.dedupeKey })), key)) {
      throw new ConflictException('this contact already exists (dedupe key ' + key + ')');
    }
    return this.contactRepository.save(
      this.contactRepository.create({
        userId,
        name: dto.name.trim(),
        email: dto.email?.trim() || undefined,
        phone: dto.phone?.trim() || undefined,
        companyName: dto.companyName?.trim() || undefined,
        notes: dto.notes,
        dedupeKey: key,
      }),
    );
  }

  async findAll(userId: string): Promise<Contact[]> {
    return this.contactRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(userId: string, id: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({ where: { id, userId } });
    if (!contact) {
      throw new NotFoundException('contact ' + id + ' not found');
    }
    return contact;
  }

  async remove(userId: string, id: string): Promise<void> {
    const contact = await this.contactRepository.findOne({ where: { id, userId } });
    if (!contact) {
      throw new NotFoundException('contact ' + id + ' not found');
    }
    await this.contactRepository.softDelete({ id: contact.id, userId });
  }
}
