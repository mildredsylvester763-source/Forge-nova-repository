// ============================================================================
// FILE: /apps/api/src/modules/quotes/quotes.service.ts
// ============================================================================
// Zero-trust quotes. Money math reuses the invoice engine (computeTotals) so
// a quote and its converted invoice can never disagree by a cent. The clock
// is read here, never in the engine.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { computeTotals } from '../invoices/engine/invoice-math';
import {
  canTransitionQuote,
  convertibleQuote,
  effectiveQuoteStatus,
  quoteLinesToInvoiceLines,
} from './engine/quote-lifecycle';

const DAY_MS = 86_400_000;
const DEFAULT_VALID_DAYS = 30;

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    private readonly invoicesService: InvoicesService,
  ) {}

  async create(userId: string, dto: CreateQuoteDto): Promise<Quote> {
    if (!Array.isArray(dto.lineItems) || dto.lineItems.length === 0) {
      throw new BadRequestException('a quote needs at least one line item');
    }
    const taxRateBp = dto.taxRatePercent === undefined ? 0 : Math.round(dto.taxRatePercent * 100);
    const totals = computeTotals(dto.lineItems, taxRateBp);
    if (totals.lineItems.length === 0) {
      throw new BadRequestException(
        'every line item was invalid: ' + totals.invalidLines.map((l) => l.reason).join('; '),
      );
    }
    const validDays = dto.validDays ?? DEFAULT_VALID_DAYS;
    const quote = this.quoteRepository.create({
      userId,
      number: await this.nextNumber(userId),
      currency: dto.currency ?? 'USD',
      status: QuoteStatus.DRAFT,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      lineItems: totals.lineItems,
      subtotalCents: totals.subtotalCents,
      taxRateBp: totals.taxRateBp,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      validUntil: new Date(Date.now() + validDays * DAY_MS),
      notes: dto.notes,
    });
    return this.quoteRepository.save(quote);
  }

  async findAll(userId: string): Promise<Quote[]> {
    const quotes = await this.quoteRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return this.projectExpiry(quotes);
  }

  async findOne(userId: string, id: string): Promise<Quote> {
    const quote = await this.getOwned(userId, id);
    return this.projectExpiry([quote])[0];
  }

  async markSent(userId: string, id: string): Promise<Quote> {
    const quote = await this.getOwned(userId, id);
    const verdict = canTransitionQuote(this.projectedStatus(quote), QuoteStatus.SENT);
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    quote.status = QuoteStatus.SENT;
    return this.quoteRepository.save(quote);
  }

  async accept(userId: string, id: string): Promise<Quote> {
    const quote = await this.getOwned(userId, id);
    const verdict = canTransitionQuote(this.projectedStatus(quote), QuoteStatus.ACCEPTED);
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    quote.status = QuoteStatus.ACCEPTED;
    return this.quoteRepository.save(quote);
  }

  async decline(userId: string, id: string): Promise<Quote> {
    const quote = await this.getOwned(userId, id);
    const verdict = canTransitionQuote(this.projectedStatus(quote), QuoteStatus.DECLINED);
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    quote.status = QuoteStatus.DECLINED;
    return this.quoteRepository.save(quote);
  }

  /** One-time conversion of an accepted quote into a real invoice. */
  async convert(userId: string, id: string): Promise<{ quote: Quote; invoice: any }> {
    const quote = await this.getOwned(userId, id);
    if (quote.status === QuoteStatus.CONVERTED || quote.convertedInvoiceId) {
      throw new ConflictException(
        'this quote already converted to invoice ' + quote.convertedInvoiceId,
      );
    }
    const projected = this.projectedStatus(quote);
    const gate = convertibleQuote(projected);
    if (!gate.allowed) {
      throw new ConflictException(gate.reason);
    }
    const invoice = await this.invoicesService.create(userId, {
      customerName: quote.customerName ?? undefined,
      customerEmail: quote.customerEmail ?? undefined,
      currency: quote.currency,
      lineItems: quoteLinesToInvoiceLines(quote.lineItems),
      taxRatePercent: quote.taxRateBp / 100,
      notes: quote.notes ?? undefined,
    });
    quote.status = QuoteStatus.CONVERTED;
    quote.convertedInvoiceId = invoice.id;
    await this.quoteRepository.save(quote);
    return { quote, invoice };
  }

  async remove(userId: string, id: string): Promise<void> {
    const quote = await this.getOwned(userId, id);
    await this.quoteRepository.softDelete({ id: quote.id, userId });
  }

  private async nextNumber(userId: string): Promise<string> {
    const [latest] = await this.quoteRepository.find({
      where: { userId },
      order: { number: 'DESC' },
      take: 1,
      withDeleted: true,
    });
    const seq = latest ? parseInt(latest.number.replace(/[^0-9]/g, ''), 10) + 1 : 1;
    return 'QT-' + String(seq).padStart(4, '0');
  }

  private async getOwned(userId: string, id: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({ where: { id, userId } });
    if (!quote) {
      throw new NotFoundException('quote with id ' + id + ' not found');
    }
    return quote;
  }

  private projectedStatus(quote: Quote): QuoteStatus {
    return effectiveQuoteStatus(quote.status, new Date(), quote.validUntil);
  }

  private projectExpiry(quotes: Quote[]): Quote[] {
    const now = new Date();
    return quotes.map((quote) => {
      const status = effectiveQuoteStatus(quote.status, now, quote.validUntil);
      return status === quote.status ? quote : { ...quote, status };
    });
  }
}
