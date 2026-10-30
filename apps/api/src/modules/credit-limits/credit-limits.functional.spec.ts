import { BadRequestException, NotFoundException } from '@nestjs/common';
import { fakeRepo } from '../../common/testing/fake-repository';
import { CreditService } from './credit-limits.service';
import { CustomerCredit } from './entities/customer-credit.entity';
import { CreditEvent } from './entities/credit-event.entity';

// Multi-user functional scenarios: two owners, races against the limit,
// refused operations leaving zero side effects. Real service instances
// wired to the shared in-memory fake repository, no database needed.

function buildService() {
  const credits = fakeRepo<CustomerCredit>();
  const events = fakeRepo<CreditEvent>();
  const service = new CreditService(credits.repo, events.repo);
  return { service, creditRows: credits.rows, eventRows: events.rows };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected a refusal but the call succeeded');
  } catch (error) {
    const err = error as { message?: string };
    if (!(error instanceof BadRequestException) && !(error instanceof NotFoundException)) {
      throw error;
    }
    return String(err.message);
  }
}

describe('credits functional scenarios', () => {
  it('keeps two owners completely separate even for the same customerRef', async () => {
    const { service } = buildService();
    await service.setLimit('owner-a', 'cust-1', 10000);
    await service.setLimit('owner-b', 'cust-1', 500);
    await service.charge('owner-a', 'cust-1', 9000, 'big order');
    const accountB = await service.charge('owner-b', 'cust-1', 400, 'small order');
    expect(accountB.usedCents).toBe(400);
    expect(accountB.limitCents).toBe(500);
    const accountA = await service.getCredit('owner-a', 'cust-1');
    expect(accountA.usedCents).toBe(9000);
    expect(accountA.limitCents).toBe(10000);
  });

  it('refuses the second of two charges that together blow the limit', async () => {
    const { service, eventRows } = buildService();
    await service.setLimit('owner-a', 'cust-1', 10000);
    const first = await service.charge('owner-a', 'cust-1', 6000, 'charge one');
    expect(first.usedCents).toBe(6000);
    const reason = await refusal(service.charge('owner-a', 'cust-1', 6000, 'charge two'));
    expect(reason).toBe('credit-charge-exceeds-limit');
    const chargeEvents = eventRows.filter((row) => row.kind === 'charge');
    expect(chargeEvents).toHaveLength(1);
    const after = await service.getCredit('owner-a', 'cust-1');
    expect(after.usedCents).toBe(6000);
  });

  it('leaves no event row and no balance change when a charge is refused', async () => {
    const { service, eventRows } = buildService();
    await service.setLimit('owner-a', 'cust-1', 1000);
    const eventsBefore = eventRows.length;
    const reason = await refusal(service.charge('owner-a', 'cust-1', 2000, 'too big'));
    expect(reason).toBe('credit-charge-exceeds-limit');
    expect(eventRows).toHaveLength(eventsBefore);
    const account = await service.getCredit('owner-a', 'cust-1');
    expect(account.usedCents).toBe(0);
  });

  it('refuses any charge for a customer with no limit set (limit 0)', async () => {
    const { service } = buildService();
    const reason = await refusal(service.charge('owner-a', 'cust-new', 100, 'no limit yet'));
    expect(reason).toBe('credit-charge-exceeds-limit');
  });

  it('allows a charge that exactly exhausts the limit', async () => {
    const { service } = buildService();
    await service.setLimit('owner-a', 'cust-1', 5000);
    const account = await service.charge('owner-a', 'cust-1', 5000, 'exact fit');
    expect(account.usedCents).toBe(5000);
    expect(account.limitCents).toBe(5000);
  });

  it('releases credit but refuses releasing more than is used', async () => {
    const { service } = buildService();
    await service.setLimit('owner-a', 'cust-1', 10000);
    await service.charge('owner-a', 'cust-1', 3000, 'order');
    const afterRelease = await service.release('owner-a', 'cust-1', 1000, 'refund');
    expect(afterRelease.usedCents).toBe(2000);
    const reason = await refusal(service.release('owner-a', 'cust-1', 5000, 'over release'));
    expect(reason).toBe('credit-release-exceeds-used');
    const account = await service.getCredit('owner-a', 'cust-1');
    expect(account.usedCents).toBe(2000);
  });

  it('refuses lowering a limit below what the customer already used', async () => {
    const { service, eventRows } = buildService();
    await service.setLimit('owner-a', 'cust-1', 10000);
    await service.charge('owner-a', 'cust-1', 3000, 'order');
    const eventsBefore = eventRows.length;
    const reason = await refusal(service.setLimit('owner-a', 'cust-1', 2000));
    expect(reason).toBe('credit-limit-below-used');
    expect(eventRows).toHaveLength(eventsBefore);
    const account = await service.getCredit('owner-a', 'cust-1');
    expect(account.limitCents).toBe(10000);
  });

  it('shows each owner only their own accounts and events', async () => {
    const { service } = buildService();
    await service.setLimit('owner-a', 'cust-1', 10000);
    await service.setLimit('owner-b', 'cust-2', 5000);
    await service.charge('owner-a', 'cust-1', 1000, 'order');
    const listA = await service.listCredits('owner-a');
    expect(listA).toHaveLength(1);
    expect(listA[0].customerRef).toBe('cust-1');
    const eventsA = await service.listEvents('owner-a');
    expect(eventsA.every((row) => row.ownerUserId === 'owner-a')).toBe(true);
    const eventsB = await service.listEvents('owner-b');
    expect(eventsB.every((row) => row.ownerUserId === 'owner-b')).toBe(true);
  });

  it('says not found when asking for a customer that was never touched', async () => {
    const { service } = buildService();
    const reason = await refusal(service.getCredit('owner-a', 'ghost'));
    expect(reason).toBe('credit-account-not-found');
  });
});
