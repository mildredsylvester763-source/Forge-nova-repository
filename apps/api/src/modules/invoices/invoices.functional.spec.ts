// ============================================================================
// FILE: /apps/api/src/modules/invoices/invoices.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL InvoicesService wired to the shared
// in-memory repository. Multi-user flows: per-user invoice numbering, the
// cross-user wall (user B cannot read or touch user A is invoices), the
// draft-sent-paid state machine, overdue projection, and soft delete.

import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceStatus } from './enums';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { fakeRepo } from '../../common/testing/fake-repository';

const DAY_MS = 86_400_000;

function build(): { service: InvoicesService; rows: Invoice[] } {
  const { repo, rows } = fakeRepo<Invoice>();
  const service = new InvoicesService(repo);
  return { service, rows };
}

function lineDto(overrides: Record<string, unknown> = {}): CreateInvoiceDto {
  return {
    lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 100 }],
    ...overrides,
  } as unknown as CreateInvoiceDto;
}

describe('invoice functional flows', () => {
  it('invoice numbering is isolated per user: both users start at INV-0001', async () => {
    const { service } = build();
    const a1 = await service.create('user-alice', lineDto());
    const b1 = await service.create('user-bob', lineDto());
    const a2 = await service.create('user-alice', lineDto());
    expect(a1.number).toBe('INV-0001');
    expect(b1.number).toBe('INV-0001');
    expect(a2.number).toBe('INV-0002');
  });

  it('user B cannot read user A is invoice: the cross-user wall', async () => {
    const { service } = build();
    const alice = await service.create('user-alice', lineDto());
    await expect(service.findOne('user-bob', alice.id)).rejects.toThrow(NotFoundException);
    // Bob also cannot move it along.
    await expect(service.markSent('user-bob', alice.id)).rejects.toThrow(NotFoundException);
    // And Alice still sees it fine.
    expect((await service.findOne('user-alice', alice.id)).id).toBe(alice.id);
  });

  it('findAll only ever shows the caller is own invoices', async () => {
    const { service } = build();
    await service.create('user-alice', lineDto());
    await service.create('user-alice', lineDto());
    await service.create('user-bob', lineDto());
    expect((await service.findAll('user-alice')).length).toBe(2);
    expect((await service.findAll('user-bob')).length).toBe(1);
  });

  it('the happy path: draft, sent, paid - with money math pinned', async () => {
    const { service } = build();
    const created = await service.create(
      'user-alice',
      lineDto({
        lineItems: [
          { description: 'Design', quantity: 2, unitPrice: 100 },
          { description: 'Hosting', quantity: 1, unitPrice: 50 },
        ],
        taxRatePercent: 10,
      }),
    );
    expect(created.status).toBe(InvoiceStatus.DRAFT);
    // 2 x 100.00 = 200.00, plus 50.00 = 250.00 subtotal; 10% tax = 25.00.
    expect(created.subtotalCents).toBe(25000);
    expect(created.taxCents).toBe(2500);
    expect(created.totalCents).toBe(27500);
    const sent = await service.markSent('user-alice', created.id);
    expect(sent.status).toBe(InvoiceStatus.SENT);
    expect(sent.sentAt).toBeDefined();
    const paid = await service.markPaid('user-alice', created.id);
    expect(paid.status).toBe(InvoiceStatus.PAID);
    expect(paid.paidAt).toBeDefined();
  });

  it('a draft invoice cannot jump straight to paid', async () => {
    const { service } = build();
    const created = await service.create('user-alice', lineDto());
    await expect(service.markPaid('user-alice', created.id)).rejects.toThrow(
      'send the invoice before recording a payment',
    );
  });

  it('paid and voided invoices are final: no further changes', async () => {
    const { service } = build();
    const created = await service.create('user-alice', lineDto());
    await service.markSent('user-alice', created.id);
    await service.markPaid('user-alice', created.id);
    await expect(service.markSent('user-alice', created.id)).rejects.toThrow(
      'a paid invoice is final',
    );
    await expect(service.voidInvoice('user-alice', created.id)).rejects.toThrow(
      'a paid invoice is final',
    );
  });

  it('a voided invoice cannot be resurrected', async () => {
    const { service } = build();
    const created = await service.create('user-alice', lineDto());
    const voided = await service.voidInvoice('user-alice', created.id);
    expect(voided.status).toBe(InvoiceStatus.VOID);
    await expect(service.markSent('user-alice', created.id)).rejects.toThrow(
      'a voided invoice is final',
    );
  });

  it('a sent invoice past its due date reads as overdue, and can still be paid', async () => {
    const { service } = build();
    const created = await service.create(
      'user-alice',
      lineDto({
        issueDate: new Date(Date.now() - 40 * DAY_MS).toISOString(),
        netDays: 30,
      }),
    );
    await service.markSent('user-alice', created.id);
    // Projection: reads overdue without anyone setting it.
    const viewed = await service.findOne('user-alice', created.id);
    expect(viewed.status).toBe(InvoiceStatus.OVERDUE);
    // Overdue can still be paid.
    const paid = await service.markPaid('user-alice', created.id);
    expect(paid.status).toBe(InvoiceStatus.PAID);
    expect((await service.findOne('user-alice', created.id)).status).toBe(InvoiceStatus.PAID);
  });

  it('a draft invoice never flips overdue, no matter how old', async () => {
    const { service } = build();
    const created = await service.create(
      'user-alice',
      lineDto({ issueDate: new Date(Date.now() - 400 * DAY_MS).toISOString(), netDays: 0 }),
    );
    expect((await service.findOne('user-alice', created.id)).status).toBe(InvoiceStatus.DRAFT);
  });

  it('soft-deleting an invoice hides it but the numbering continues', async () => {
    const { service } = build();
    const first = await service.create('user-alice', lineDto());
    await service.remove('user-alice', first.id);
    await expect(service.findOne('user-alice', first.id)).rejects.toThrow(NotFoundException);
    const second = await service.create('user-alice', lineDto());
    expect(second.number).toBe('INV-0002');
    expect((await service.findAll('user-alice')).length).toBe(1);
  });

  it('refuses empty and fully-invalid line items by name', async () => {
    const { service } = build();
    await expect(
      service.create('user-alice', lineDto({ lineItems: [] })),
    ).rejects.toThrow('an invoice needs at least one line item');
    await expect(
      service.create('user-alice', lineDto({ lineItems: [{ description: ' ', quantity: 0, unitPrice: -1 }] })),
    ).rejects.toThrow('every line item was invalid');
  });
});
