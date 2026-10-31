import { BadRequestException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { PortalService } from './portal.service';
import { PortalSession } from './entities/portal-session.entity';
import { PortalVisit } from './entities/portal-visit.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Quote } from '../quotes/entities/quote.entity';

// Multi-user portal scenarios: two owners with the same customer email,
// token mix-ups, revoked sessions, double revokes, and the redaction
// guarantee. Real service wired to the shared in-memory fake repositories.

function buildService() {
  const sessions = fakeRepo<PortalSession>();
  const visits = fakeRepo<PortalVisit>();
  const invoices = fakeRepo<Invoice>();
  const quotes = fakeRepo<Quote>();
  const service = new PortalService(
    sessions.repo,
    visits.repo,
    invoices.repo,
    quotes.repo,
  );
  return {
    service,
    sessionRows: sessions.rows,
    visitRows: visits.rows,
    invoiceRows: invoices.rows,
    quoteRows: quotes.rows,
  };
}

function seedInvoice(invoices: ReturnType<typeof buildService>['invoiceRows'], row: Partial<Invoice>) {
  invoices.push({ ...row } as Invoice);
}

function seedQuote(quotes: ReturnType<typeof buildService>['quoteRows'], row: Partial<Quote>) {
  quotes.push({ ...row } as Quote);
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected a refusal but the call succeeded');
  } catch (error) {
    if (!(error instanceof BadRequestException) && !(error instanceof NotFoundException)) {
      throw error;
    }
    return String((error as { message?: string }).message);
  }
}

describe('portal functional scenarios', () => {
  it('keeps two owners with the same customer email completely separate', async () => {
    const ctx = buildService();
    const sessionA = await ctx.service.openSession('owner-a', 'shared@example.com');
    const sessionB = await ctx.service.openSession('owner-b', 'shared@example.com');
    seedInvoice(ctx.invoiceRows, { userId: 'owner-a', customerEmail: 'shared@example.com', number: 'INV-A1', totalCents: 1000 });
    seedInvoice(ctx.invoiceRows, { userId: 'owner-b', customerEmail: 'shared@example.com', number: 'INV-B1', totalCents: 2000 });
    const viewA = await ctx.service.viewResource(sessionA.token, 'invoices');
    expect(viewA.records).toHaveLength(1);
    expect(viewA.records[0].number).toBe('INV-A1');
    const viewB = await ctx.service.viewResource(sessionB.token, 'invoices');
    expect(viewB.records).toHaveLength(1);
    expect(viewB.records[0].number).toBe('INV-B1');
  });

  it('refuses a view through a revoked session and records no visit', async () => {
    const ctx = buildService();
    const session = await ctx.service.openSession('owner-a', 'ann@example.com');
    await ctx.service.revokeSession('owner-a', session.token);
    const reason = await refusal(ctx.service.viewResource(session.token, 'invoices'));
    expect(reason).toBe('portal-session-revoked');
    expect(ctx.visitRows).toHaveLength(0);
  });

  it('refuses a view for a different customer email and records no visit', async () => {
    const ctx = buildService();
    const session = await ctx.service.openSession('owner-a', 'ann@example.com');
    seedInvoice(ctx.invoiceRows, { userId: 'owner-a', customerEmail: 'bob@example.com', number: 'INV-B1', totalCents: 100 });
    const reason = await refusal(
      ctx.service.viewResource(session.token, 'invoices', 'bob@example.com'),
    );
    expect(reason).toBe('portal-wrong-customer');
    expect(ctx.visitRows).toHaveLength(0);
  });

  it('refuses a second revoke and changes nothing on the already revoked session', async () => {
    const ctx = buildService();
    const session = await ctx.service.openSession('owner-a', 'ann@example.com');
    const first = await ctx.service.revokeSession('owner-a', session.token);
    const revokedAt = first.revokedAt;
    const reason = await refusal(ctx.service.revokeSession('owner-a', session.token));
    expect(reason).toBe('portal-session-already-revoked');
    expect(first.status).toBe('revoked');
    expect(first.revokedAt).toBe(revokedAt);
    expect(ctx.sessionRows).toHaveLength(1);
  });

  it('lets one owner revoke only their own session', async () => {
    const ctx = buildService();
    const sessionA = await ctx.service.openSession('owner-a', 'ann@example.com');
    const sessionB = await ctx.service.openSession('owner-b', 'bob@example.com');
    const reason = await refusal(ctx.service.revokeSession('owner-b', sessionA.token));
    expect(reason).toBe('portal-session-not-found');
    expect(sessionA.status).toBe('active');
    await ctx.service.revokeSession('owner-a', sessionA.token);
    expect(sessionA.status).toBe('revoked');
    expect(sessionB.status).toBe('active');
  });

  it('never leaks internal invoice or quote fields through the portal', async () => {
    const ctx = buildService();
    const session = await ctx.service.openSession('owner-a', 'ann@example.com');
    seedInvoice(ctx.invoiceRows, {
      userId: 'owner-a',
      customerEmail: 'ann@example.com',
      number: 'INV-0001',
      status: 'sent',
      currency: 'USD',
      totalCents: 5000,
      notes: 'private note never for the customer',
      lineItems: [{ description: 'hidden', quantity: 1, unitPrice: 5000, lineTotalCents: 5000 }],
    });
    const view = await ctx.service.viewResource(session.token, 'invoices');
    expect(view.records).toHaveLength(1);
    const record = view.records[0];
    expect(Object.keys(record).sort()).toEqual(
      ['currency', 'dueDate', 'number', 'status', 'totalCents'].sort(),
    );
    expect(record.totalCents).toBe(5000);
  });

  it('serves quotes but refuses resources the portal does not offer', async () => {
    const ctx = buildService();
    const session = await ctx.service.openSession('owner-a', 'ann@example.com');
    seedQuote(ctx.quoteRows, {
      userId: 'owner-a',
      customerEmail: 'ann@example.com',
      number: 'QT-0001',
      status: 'sent',
      totalCents: 7000,
    });
    const view = await ctx.service.viewResource(session.token, 'quotes');
    expect(view.records).toHaveLength(1);
    expect(view.records[0].number).toBe('QT-0001');
    const reason = await refusal(ctx.service.viewResource(session.token, 'payments'));
    expect(reason).toBe('portal-resource-not-offered');
    expect(ctx.visitRows).toHaveLength(1);
  });

  it('issues multiple working sessions for the same owner and customer', async () => {
    const ctx = buildService();
    seedInvoice(ctx.invoiceRows, { userId: 'owner-a', customerEmail: 'ann@example.com', number: 'INV-0001', totalCents: 100 });
    const first = await ctx.service.openSession('owner-a', 'ann@example.com');
    const second = await ctx.service.openSession('owner-a', 'ann@example.com');
    expect(first.token).not.toBe(second.token);
    const viewOne = await ctx.service.viewResource(first.token, 'invoices');
    const viewTwo = await ctx.service.viewResource(second.token, 'invoices');
    expect(viewOne.records).toHaveLength(1);
    expect(viewTwo.records).toHaveLength(1);
  });

  it('refuses to open a session for a broken email and records nothing', async () => {
    const ctx = buildService();
    const reason = await refusal(ctx.service.openSession('owner-a', 'not-an-email'));
    expect(reason).toBe('portal-invalid-email');
    expect(ctx.sessionRows).toHaveLength(0);
  });

  it('says not found for an unknown token and records no visit', async () => {
    const ctx = buildService();
    const reason = await refusal(ctx.service.viewResource('no-such-token', 'invoices'));
    expect(reason).toBe('portal-session-not-found');
    expect(ctx.visitRows).toHaveLength(0);
  });
});
