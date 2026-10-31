import { buildPact, verifyContract } from './contract-testing';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SweepInteraction {
  description: string;
  request: { method: string; path: string };
  response: { status: number; body?: unknown };
}

interface SweepResponse {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

describe('contract-testing engine (FORGE TQ-037)', () => {
  it('builds a normalized pact from raw interactions', () => {
    const pact = buildPact({
      consumer: 'web-shop',
      provider: 'billing',
      interactions: [
        {
          description: 'get invoice',
          request: { method: 'GET', path: 'api/invoices/7' },
          response: { status: 200, body: { id: 7, total: 90 } },
        },
        {
          description: 'create payment',
          request: { method: 'post', path: '//api//payments' },
          response: { status: 201, body: { status: 'paid', tags: ['a'] } },
        },
      ],
    });
    expect(pact.ok).toBe(true);
    expect(pact.count).toBe(2);
    expect(pact.interactions?.[0].request.path).toBe('/api/invoices/7');
    expect(pact.interactions?.[1].request.method).toBe('POST');
    expect(pact.interactions?.[1].request.path).toBe('/api/payments');
  });

  it('verifies pacts against provider responses with subset bodies', () => {
    const verified = verifyContract({
      consumer: 'web-shop',
      provider: 'billing',
      interactions: [
        {
          description: 'get invoice',
          request: { method: 'GET', path: '/api/invoices/7' },
          response: { status: 200, body: { id: 7, total: 90 } },
        },
        {
          description: 'create payment',
          request: { method: 'POST', path: '/api/payments' },
          response: { status: 201, body: { status: 'paid', tags: ['a'] } },
        },
      ],
      providerResponses: [
        { method: 'get', path: '/api/invoices/7', status: 200, body: { id: 7, total: 90, currency: 'USD' } },
        { method: 'POST', path: '/api/payments', status: 201, body: { status: 'paid', tags: ['a'], fee: 3 } },
      ],
    });
    expect(verified.ok).toBe(true);
    expect(verified.verified).toBe(2);
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [
          { description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200, body: { total: 90 } } },
        ],
        providerResponses: [{ method: 'GET', path: '/a', status: 500, body: { total: 90 } }],
      }),
    ).toMatchObject({ reason: 'contract-status-mismatch:1:200:500' });
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [
          { description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200, body: { total: 90 } } },
        ],
        providerResponses: [{ method: 'GET', path: '/a', status: 200, body: { total: 91, extra: 1 } }],
      }),
    ).toMatchObject({ reason: 'contract-body-mismatch:1:$.total' });
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [
          { description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200, body: { list: ['a', 'b'] } } },
        ],
        providerResponses: [{ method: 'GET', path: '/a', status: 200, body: { list: ['a', 'x'] } }],
      }),
    ).toMatchObject({ reason: 'contract-body-mismatch:1:$.list[1]' });
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [
          { description: 'x', request: { method: 'POST', path: '/api/orders' }, response: { status: 201 } },
        ],
        providerResponses: [{ method: 'GET', path: '/a', status: 200 }],
      }),
    ).toMatchObject({ reason: 'contract-route-missing:1:POST:/api/orders' });
  });

  it('refuses invalid pacts and responses with named reasons', () => {
    expect(
      buildPact({
        consumer: '',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200 } }],
      }),
    ).toMatchObject({ reason: 'contract-consumer-missing' });
    expect(buildPact({ consumer: 'c', provider: 'p', interactions: [] })).toMatchObject({
      reason: 'contract-interactions-empty',
    });
    expect(
      buildPact({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: '', request: { method: 'GET', path: '/a' }, response: { status: 200 } }],
      }),
    ).toMatchObject({ reason: 'contract-description-missing:1' });
    expect(
      buildPact({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: '', path: '/a' }, response: { status: 200 } }],
      }),
    ).toMatchObject({ reason: 'contract-method-missing:1' });
    expect(
      buildPact({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '' }, response: { status: 200 } }],
      }),
    ).toMatchObject({ reason: 'contract-path-missing:1' });
    expect(
      buildPact({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 99 } }],
      }),
    ).toMatchObject({ reason: 'contract-status-invalid:1:99' });
    expect(
      buildPact({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '/a' } }],
      }),
    ).toMatchObject({ reason: 'contract-status-missing:1' });
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200 } }],
        providerResponses: [],
      }),
    ).toMatchObject({ reason: 'contract-responses-missing' });
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200 } }],
        providerResponses: [{ method: '', path: '/a', status: 200 }],
      }),
    ).toMatchObject({ reason: 'contract-response-method-missing:1' });
    expect(
      verifyContract({
        consumer: 'c',
        provider: 'p',
        interactions: [{ description: 'x', request: { method: 'GET', path: '/a' }, response: { status: 200 } }],
        providerResponses: [{ method: 'GET', path: '/a' }],
      }),
    ).toMatchObject({ reason: 'contract-response-status-missing:1' });
  });

  it('matches an independent queue oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    const segs = ['users', 'orders', 'items', 'invoices', 'payments'];
    const statuses = [200, 201, 404, 500];
    const oracleSubset = (expected: unknown, actual: unknown): string | null => {
      if (expected === undefined) return null;
      const queue: Array<{ e: unknown; a: unknown; p: string }> = [{ e: expected, a: actual, p: '$' }];
      while (queue.length > 0) {
        const item = queue.shift() as { e: unknown; a: unknown; p: string };
        const e = item.e;
        const a = item.a;
        const p = item.p;
        if (e === undefined) continue;
        if (a === undefined) return p;
        if (Array.isArray(e)) {
          if (!Array.isArray(a) || a.length !== e.length) return p;
          for (let i = 0; i < e.length; i++) queue.push({ e: e[i], a: a[i], p: p + '[' + i + ']' });
        } else if (e !== null && typeof e === 'object') {
          if (a === null || typeof a !== 'object' || Array.isArray(a)) return p;
          const eo = e as Record<string, unknown>;
          const ao = a as Record<string, unknown>;
          for (const k of Object.keys(eo)) {
            const child = p === '$' ? '$.' + k : p + '.' + k;
            if (!(k in ao)) return child;
            queue.push({ e: eo[k], a: ao[k], p: child });
          }
        } else if (e !== a) return p;
      }
      return null;
    };
    for (let c = 0; c < 500; c++) {
      const n = 1 + Math.floor(rand() * 3);
      const interactions: SweepInteraction[] = [];
      for (let i = 0; i < n; i++) {
        const method = methods[Math.floor(rand() * methods.length)];
        const path =
          (rand() < 0.3 ? '' : '/') +
          'api/' +
          segs[Math.floor(rand() * segs.length)] +
          (rand() < 0.3 ? '/' + String(1 + Math.floor(rand() * 9)) : '');
        const status = statuses[Math.floor(rand() * statuses.length)];
        const bodyKind = Math.floor(rand() * 4);
        let body: unknown;
        if (bodyKind === 0) body = { id: Math.floor(rand() * 100), name: 'n' + Math.floor(rand() * 10) };
        else if (bodyKind === 1)
          body = { list: ['a', 'b', 'c'].slice(0, 1 + Math.floor(rand() * 3)), ok: rand() < 0.5 };
        else if (bodyKind === 2) body = { nested: { deep: { value: Math.floor(rand() * 50) } } };
        interactions.push({
          description: 'd' + i,
          request: { method, path },
          response: { status, body },
        });
      }
      const providerResponses: SweepResponse[] = [];
      const perturb = Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const inter = interactions[i];
        let method = inter.request.method;
        let path = inter.request.path;
        if (rand() < 0.25) path = '/' + path;
        if (rand() < 0.15) method = method.toLowerCase();
        let body: unknown = inter.response.body;
        if (i === perturb) {
          const kind = Math.floor(rand() * 4);
          if (kind === 0) {
            providerResponses.push({
              method,
              path,
              status: statuses[Math.floor(rand() * statuses.length)],
              body,
            });
            continue;
          }
          if (kind === 1 && body !== undefined) body = JSON.parse(JSON.stringify(body).replace(/"value":\d+/, '"value":99999'));
          else if (kind === 2) path = '/api/nowhere';
          else if (kind === 3) body = undefined;
        } else if (body !== undefined) {
          const copy = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
          copy.extraKey = 'x';
          body = copy;
        }
        providerResponses.push({ method, path, status: inter.response.status, body });
      }
      const verdict = verifyContract({
        consumer: 'c' + c,
        provider: 'p' + c,
        interactions,
        providerResponses,
      });
      let expOk = true;
      let expReason = '';
      for (let i = 0; i < n; i++) {
        const inter = interactions[i];
        const nm = inter.request.method.toUpperCase();
        let np = inter.request.path.replace(/\/{2,}/g, '/');
        if (!np.startsWith('/')) np = '/' + np;
        const route = providerResponses.find((r) => {
          let rp = r.path.replace(/\/{2,}/g, '/');
          if (!rp.startsWith('/')) rp = '/' + rp;
          return r.method.toUpperCase() === nm && rp === np;
        });
        if (!route) {
          expOk = false;
          expReason = 'contract-route-missing:' + (i + 1) + ':' + nm + ':' + np;
          break;
        }
        if (route.status !== inter.response.status) {
          expOk = false;
          expReason = 'contract-status-mismatch:' + (i + 1) + ':' + inter.response.status + ':' + route.status;
          break;
        }
        const mm = oracleSubset(inter.response.body, route.body);
        if (mm !== null) {
          expOk = false;
          expReason = 'contract-body-mismatch:' + (i + 1) + ':' + mm;
          break;
        }
      }
      expect(verdict.ok).toBe(expOk);
      if (!expOk) expect(verdict.reason ?? '').toBe(expReason);
    }
  });
});
