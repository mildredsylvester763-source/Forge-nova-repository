// ============================================================================
// FILE: /apps/api/src/modules/notifications/notifications.service.spec.ts
// ============================================================================
// Unit tests with a faked repository — no database, no Nest container.

import { NotificationsService } from './notifications.service';

function makeRepo() {
  const rows: any[] = [];
  return {
    rows,
    create: (x: any) => ({ ...x }),
    save: async (x: any) => { rows.push(x); return x; },
    findAndCount: async (opts: any) => {
      const filtered = rows.filter(r => r.userId === opts.where.userId);
      return [filtered, filtered.length];
    },
    count: async (opts: any) => rows.filter(r => r.userId === opts.where.userId && !r.readAt).length,
    findOne: async (opts: any) => rows.find(r => r.id === opts.where.id && r.userId === opts.where.userId) || null,
    update: async (crit: any) => {
      let affected = 0;
      for (const r of rows) if (r.userId === crit.userId && !r.readAt) { r.readAt = new Date(); affected++; }
      return { affected };
    },
    softDelete: async (id: string) => {
      const r = rows.find(x => x.id === id);
      if (r) r.deletedAt = new Date();
      return { affected: r ? 1 : 0 };
    },
  };
}

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

describe('NotificationsService', () => {
  it('creates a notification and trims the title', async () => {
    const repo: any = makeRepo();
    const svc = new NotificationsService(repo);
    const n = await svc.create(U1, { type: 'scan_completed', title: '  Scan done  ', message: 'ok' });
    expect(n.title).toBe('Scan done');
    expect(repo.rows.length).toBe(1);
  });

  it('rejects an unknown type and a blank title', async () => {
    const repo: any = makeRepo();
    const svc = new NotificationsService(repo);
    await expect(svc.create(U1, { type: 'nonsense' as any, title: 'x', message: 'm' })).rejects.toThrow();
    await expect(svc.create(U1, { type: 'system', title: '   ', message: 'm' })).rejects.toThrow();
  });

  it('scopes reads strictly to the owner', async () => {
    const repo: any = makeRepo();
    const svc = new NotificationsService(repo);
    const a = await svc.create(U1, { type: 'system', title: 'a', message: 'm' });
    a.id = 'aaa-1';
    await expect(svc.markRead(U2, 'aaa-1')).rejects.toThrow();
    await svc.markRead(U1, 'aaa-1');
    expect(a.readAt).toBeInstanceOf(Date);
  });

  it('markRead is idempotent (first timestamp wins)', async () => {
    const repo: any = makeRepo();
    const svc = new NotificationsService(repo);
    const n = await svc.create(U1, { type: 'system', title: 't', message: 'm' });
    n.id = 'bbb-1';
    await svc.markRead(U1, 'bbb-1');
    const first = n.readAt;
    await svc.markRead(U1, 'bbb-1');
    expect(n.readAt).toBe(first);
  });

  it('markAllRead reports how many flipped', async () => {
    const repo: any = makeRepo();
    const svc = new NotificationsService(repo);
    await svc.create(U1, { type: 'system', title: '1', message: 'm' });
    await svc.create(U1, { type: 'system', title: '2', message: 'm' });
    await svc.create(U2, { type: 'system', title: '3', message: 'm' });
    const r = await svc.markAllRead(U1);
    expect(r.updated).toBe(2);
  });
});
