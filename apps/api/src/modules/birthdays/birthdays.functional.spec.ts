// ============================================================================
// FILE: /apps/api/src/modules/birthdays/birthdays.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL BirthdaysService wired to in-memory
// repositories. Multi-user flows: two customers sharing a birthday both
// get messages, once-per-year is enforced, off-days are quiet, one owner
// cannot trigger another owner is birthday, and the outbox is isolated.

import { fakeRepo } from '../../common/testing/fake-repository';
import { BirthdaysService } from './birthdays.service';
import { Birthday } from './entities/birthday.entity';
import { BirthdayOutbox } from './entities/birthday-outbox.entity';

function buildService(): {
  service: BirthdaysService;
  birthdays: Birthday[];
  outbox: BirthdayOutbox[];
} {
  const birthdays = fakeRepo<Birthday>();
  const outbox = fakeRepo<BirthdayOutbox>();
  const service = new BirthdaysService(birthdays.repo, outbox.repo);
  return { service, birthdays: birthdays.rows, outbox: outbox.rows };
}

describe('birthday functional flows', () => {
  it('upserting the same customer twice updates the date, never duplicates', async () => {
    const { service, birthdays } = buildService();
    const first = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    const second = await service.upsertBirthday('user-alice', 'Carol', '07-09');
    expect(second.id).toBe(first.id);
    expect(second.birthMonthDay).toBe('07-09');
    expect(birthdays.length).toBe(1);
  });

  it('two different owners can track the SAME customer name independently', async () => {
    const { service, birthdays } = buildService();
    await service.upsertBirthday('user-alice', 'Carol', '03-14');
    await service.upsertBirthday('user-bob', 'Carol', '09-21');
    expect(birthdays.length).toBe(2);
    expect((await service.listBirthdays('user-alice')).length).toBe(1);
    expect((await service.listBirthdays('user-bob'))[0].birthMonthDay).toBe('09-21');
  });

  it('two customers with the same birthday BOTH get a message on the day', async () => {
    const { service, outbox } = buildService();
    const carol = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    const dave = await service.upsertBirthday('user-alice', 'Dave', '03-14');
    const a = await service.checkAndSend('user-alice', carol.id, {
      year: 2026,
      monthDay: '03-14',
    });
    const b = await service.checkAndSend('user-alice', dave.id, {
      year: 2026,
      monthDay: '03-14',
    });
    expect(a.sent).toBe(true);
    expect(b.sent).toBe(true);
    expect(a.message).toContain('Carol');
    expect(b.message).toContain('Dave');
    expect(outbox.length).toBe(2);
  });

  it('a birthday never sends twice in the same year', async () => {
    const { service, outbox } = buildService();
    const row = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    const first = await service.checkAndSend('user-alice', row.id, {
      year: 2026,
      monthDay: '03-14',
    });
    const second = await service.checkAndSend('user-alice', row.id, {
      year: 2026,
      monthDay: '03-14',
    });
    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.reason).toBe('birthday-already-sent-this-year');
    expect(outbox.length).toBe(1);
  });

  it('an off-day check is quiet and leaves no message', async () => {
    const { service, outbox } = buildService();
    const row = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    const result = await service.checkAndSend('user-alice', row.id, {
      year: 2026,
      monthDay: '03-15',
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('birthday-not-today');
    expect(outbox.length).toBe(0);
  });

  it('the next year the birthday sends again', async () => {
    const { service, outbox } = buildService();
    const row = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    await service.checkAndSend('user-alice', row.id, { year: 2026, monthDay: '03-14' });
    const again = await service.checkAndSend('user-alice', row.id, {
      year: 2027,
      monthDay: '03-14',
    });
    expect(again.sent).toBe(true);
    expect(outbox.length).toBe(2);
  });

  it('one owner cannot trigger or read another owner is birthday', async () => {
    const { service } = buildService();
    const row = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    await expect(
      service.checkAndSend('user-bob', row.id, { year: 2026, monthDay: '03-14' }),
    ).rejects.toThrow('birthday-not-found');
    const bobList = await service.listBirthdays('user-bob');
    expect(bobList.length).toBe(0);
  });

  it('the same customer gets the same message text every check within a year', async () => {
    const { service } = buildService();
    const row = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    const first = await service.checkAndSend('user-alice', row.id, {
      year: 2026,
      monthDay: '03-14',
    });
    const nextYear = await service.checkAndSend('user-alice', row.id, {
      year: 2027,
      monthDay: '03-14',
    });
    if (first.message && nextYear.message) {
      // Same name, same variant index basis -> same template.
      expect(first.message).toBe(nextYear.message);
    } else {
      throw new Error('messages were not produced');
    }
  });

  it('bad dates and names are refused through the service with named errors', async () => {
    const { service } = buildService();
    await expect(service.upsertBirthday('user-alice', 'Carol', '13-01')).rejects.toThrow(
      'birthday-invalid-month',
    );
    await expect(service.upsertBirthday('user-alice', 'Carol', '0331')).rejects.toThrow(
      'birthday-invalid-month-day',
    );
    await expect(service.upsertBirthday('user-alice', '', '03-14')).rejects.toThrow(
      'birthday-invalid-name',
    );
  });

  it('the outbox listing shows only the owner is own messages', async () => {
    const { service } = buildService();
    const a = await service.upsertBirthday('user-alice', 'Carol', '03-14');
    const b = await service.upsertBirthday('user-bob', 'Dave', '03-14');
    await service.checkAndSend('user-alice', a.id, { year: 2026, monthDay: '03-14' });
    await service.checkAndSend('user-bob', b.id, { year: 2026, monthDay: '03-14' });
    const aliceOutbox = await service.listOutbox('user-alice');
    expect(aliceOutbox.length).toBe(1);
    expect(aliceOutbox[0].name).toBe('Carol');
    expect((await service.listOutbox('user-bob'))[0].name).toBe('Dave');
  });
});
