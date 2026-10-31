import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortalSession } from './entities/portal-session.entity';
import { PortalVisit } from './entities/portal-visit.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Quote } from '../quotes/entities/quote.entity';
import {
  decidePortalView,
  redactInvoice,
  redactQuote,
  validateCustomerEmail,
} from './engine/portal-access-engine';

// Honest grounding: opening a session creates a secret token and records it.
// We never pretend to send the link; handing it to the customer is the
// owner's job. A refused view changes nothing: no visit row, no records.

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(PortalSession)
    private readonly sessions: Repository<PortalSession>,
    @InjectRepository(PortalVisit)
    private readonly visits: Repository<PortalVisit>,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    @InjectRepository(Quote)
    private readonly quotes: Repository<Quote>,
  ) {}

  async openSession(ownerUserId: string, customerEmail: string): Promise<PortalSession> {
    const emailVerdict = validateCustomerEmail(customerEmail);
    if (!emailVerdict.ok) throw new BadRequestException(emailVerdict.reason);
    const token = randomUUID() + '.' + randomUUID();
    const session = this.sessions.create({
      ownerUserId,
      customerEmail: emailVerdict.value,
      token,
      status: 'active',
    });
    return this.sessions.save(session);
  }

  async listSessions(ownerUserId: string): Promise<PortalSession[]> {
    return this.sessions.find({ where: { ownerUserId } });
  }

  async revokeSession(ownerUserId: string, token: string): Promise<PortalSession> {
    const session = await this.sessions.findOne({ where: { token, ownerUserId } });
    if (!session) throw new NotFoundException('portal-session-not-found');
    if (session.status !== 'active') {
      throw new BadRequestException('portal-session-already-revoked');
    }
    session.status = 'revoked';
    session.revokedAt = new Date();
    return this.sessions.save(session);
  }

  async viewResource(
    token: string,
    resource: string,
    requestedCustomerEmail?: string,
  ): Promise<{ customerEmail: string; resource: string; records: Record<string, unknown>[] }> {
    const session = await this.sessions.findOne({ where: { token } });
    if (!session) throw new NotFoundException('portal-session-not-found');
    const targetEmail = requestedCustomerEmail ?? session.customerEmail;
    const verdict = decidePortalView({
      sessionStatus: session.status,
      sessionCustomerEmail: session.customerEmail,
      requestedCustomerEmail: targetEmail,
      resource,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    let records: Record<string, unknown>[];
    if (verdict.value.resource === 'invoices') {
      const rows = await this.invoices.find({
        where: { userId: session.ownerUserId, customerEmail: verdict.value.customerEmail },
        order: { createdAt: 'ASC' },
      });
      records = rows.map((row) => redactInvoice(row as unknown as Record<string, unknown>));
    } else {
      const rows = await this.quotes.find({
        where: { userId: session.ownerUserId, customerEmail: verdict.value.customerEmail },
        order: { createdAt: 'ASC' },
      });
      records = rows.map((row) => redactQuote(row as unknown as Record<string, unknown>));
    }
    await this.visits.save(
      this.visits.create({
        ownerUserId: session.ownerUserId,
        customerEmail: verdict.value.customerEmail,
        resource: verdict.value.resource,
      }),
    );
    return { customerEmail: verdict.value.customerEmail, resource: verdict.value.resource, records };
  }

  async listVisits(ownerUserId: string): Promise<PortalVisit[]> {
    return this.visits.find({ where: { ownerUserId } });
  }
}
