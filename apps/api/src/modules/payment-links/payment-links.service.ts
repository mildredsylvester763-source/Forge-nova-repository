// ============================================================================
// FILE: /apps/api/src/modules/payment-links/payment-links.service.ts
// ============================================================================
// Zero-trust payment links. The token is the capability: anyone holding it
// may pay, but management (list, cancel) is scoped to the owner, and a
// linked invoice can only ever belong to the owner. Consuming a link
// records the use and, for invoice links, marks the invoice paid through
// the invoices service — never by editing invoice rows directly.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentLink } from './entities/payment-link.entity';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/enums';
import { InvoicesService } from '../invoices/invoices.service';
import { canConsumeLink, effectiveLinkStatus } from './engine/payment-link-state';

@Injectable()
export class PaymentLinksService {
  constructor(
    @InjectRepository(PaymentLink)
    private readonly linkRepository: Repository<PaymentLink>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly invoicesService: InvoicesService,
  ) {}

  async create(userId: string, dto: CreatePaymentLinkDto): Promise<PaymentLink> {
    let amountCents: number | undefined;
    let currency: string | undefined = dto.currency;
    if (dto.invoiceId) {
      const invoice = await this.invoiceRepository.findOne({
        where: { id: dto.invoiceId, userId },
      });
      if (!invoice) {
        throw new NotFoundException('invoice ' + dto.invoiceId + ' not found');
      }
      if (invoice.status === InvoiceStatus.PAID) {
        throw new ConflictException('invoice is already paid — nothing to collect');
      }
      if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
        throw new ConflictException('only sent invoices can be collected; this invoice is ' + invoice.status);
      }
      amountCents = invoice.totalCents;
      currency = currency ?? invoice.currency;
    } else {
      if (!dto.amountCents) {
        throw new BadRequestException('a standalone link needs amountCents');
      }
      amountCents = dto.amountCents;
    }
    const link = this.linkRepository.create({
      userId,
      token: this.newToken(),
      invoiceId: dto.invoiceId,
      amountCents,
      currency: currency ?? 'USD',
      singleUse: dto.singleUse ?? true,
      maxUses: dto.singleUse === false ? (dto.maxUses ?? 1) : undefined,
      uses: 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      status: 'active',
      notes: dto.notes,
    });
    return this.linkRepository.save(link);
  }

  /** What the customer needs to pay — resolved by token, no ownership data leaked. */
  async resolveByToken(token: string): Promise<{
    status: string;
    amountCents?: number;
    currency?: string;
    invoiceNumber?: string;
    customerName?: string;
  }> {
    const link = await this.linkRepository.findOne({ where: { token } });
    if (!link) {
      throw new NotFoundException('payment link not found');
    }
    const eff = effectiveLinkStatus(link, new Date());
    if (link.invoiceId) {
      const invoice = await this.invoiceRepository.findOne({ where: { id: link.invoiceId } });
      return {
        status: eff,
        amountCents: link.amountCents,
        currency: link.currency,
        invoiceNumber: invoice?.number,
        customerName: invoice?.customerName,
      };
    }
    return { status: eff, amountCents: link.amountCents, currency: link.currency };
  }

  /** A customer pays through the link. Marks a linked invoice paid on full amount. */
  async consumeByToken(
    token: string,
    amountCents?: number,
  ): Promise<{ link: PaymentLink; invoice?: any; reason: string }> {
    const link = await this.linkRepository.findOne({ where: { token } });
    if (!link) {
      throw new NotFoundException('payment link not found');
    }
    const owner = link.userId;
    const now = new Date();
    const payment = amountCents ?? link.amountCents;
    const verdict = canConsumeLink(link, now, payment);
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    let invoice: any = undefined;
    if (link.invoiceId) {
      const owned = await this.invoiceRepository.findOne({
        where: { id: link.invoiceId, userId: owner },
      });
      if (!owned) {
        throw new NotFoundException('the linked invoice no longer exists');
      }
      if (owned.status === InvoiceStatus.PAID) {
        throw new ConflictException('the linked invoice is already paid');
      }
      if (payment !== undefined && payment < owned.totalCents) {
        throw new ConflictException(
          'partial payments are not supported yet: invoice needs ' + owned.totalCents + ' cents, offered ' + payment,
        );
      }
      invoice = await this.invoicesService.markPaid(owner, owned.id);
    }
    link.uses = link.uses + 1;
    if (link.singleUse || (link.maxUses !== undefined && link.uses >= link.maxUses)) {
      link.consumedAt = now;
    }
    await this.linkRepository.save(link);
    return {
      link,
      invoice,
      reason: invoice
        ? 'payment recorded and invoice ' + invoice.number + ' marked paid'
        : 'payment of ' + payment + ' cents recorded',
    };
  }

  async findAll(userId: string): Promise<PaymentLink[]> {
    return this.linkRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async cancel(userId: string, id: string): Promise<PaymentLink> {
    const link = await this.linkRepository.findOne({ where: { id, userId } });
    if (!link) {
      throw new NotFoundException('payment link ' + id + ' not found');
    }
    if (link.status === 'canceled') {
      throw new ConflictException('payment link is already canceled');
    }
    if (effectiveLinkStatus(link, new Date()) === 'consumed') {
      throw new ConflictException('a used payment link cannot be canceled');
    }
    link.status = 'canceled';
    return this.linkRepository.save(link);
  }

  async remove(userId: string, id: string): Promise<void> {
    const link = await this.linkRepository.findOne({ where: { id, userId } });
    if (!link) {
      throw new NotFoundException('payment link ' + id + ' not found');
    }
    if (link.uses > 0) {
      throw new ConflictException('a used payment link is part of the payment record and cannot be deleted');
    }
    await this.linkRepository.softDelete({ id: link.id, userId });
  }

  private newToken(): string {
    // 244 bits of randomness. The token IS the capability.
    return (
      crypto.randomUUID().replace(/-/g, '') +
      crypto.randomUUID().replace(/-/g, '')
    );
  }
}
