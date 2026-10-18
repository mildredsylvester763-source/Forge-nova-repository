// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/destination-catalog.spec.ts
// ============================================================================
import {
  listDestinations,
  lookupDestination,
  validateCredentials,
  resolveBaseUrl,
  type DestinationDefinition,
} from './destination-catalog';

describe('destination-catalog (888 outbound destinations)', () => {
  it('ships 888 destinations', () => {
    expect(listDestinations().length).toBe(888);
  });

  it('includes key destinations', () => {
    const ids = new Set(listDestinations().map((d) => d.id));
    expect(ids.has('mono')).toBe(true);
    expect(ids.has('shopify')).toBe(true);
    expect(ids.has('slack')).toBe(true);
    expect(ids.has('custom-http')).toBe(true);
    expect(ids.has('whatsapp-cloud')).toBe(true);
    expect(ids.has('openai')).toBe(true);
    expect(ids.has('twilio')).toBe(true);
    expect(ids.has('google-maps')).toBe(true);
  });

  it('has globally unique destination ids', () => {
    const all = listDestinations();
    const ids = new Set(all.map((d) => d.id));
    expect(ids.size).toBe(all.length);
  });

  it('has valid shape for every destination (sweep)', () => {
    const kinds = new Set<DestinationDefinition['kind']>([
      'messaging','email','open-banking','ecommerce','crm','support','storage','productivity',
      'chat','social','finance','data','custom','payments','crypto','accounting','billing','hr',
      'recruiting','legal','kyc','esign','scheduling','devtools','observability','security','qa',
      'identity','shipping','marketplace','reviews','marketing','ads','surveys','forms','analytics',
      'cloud','database','cms','ai','search','automation','notifications','conferencing','translation',
      'media','music','podcasts','images','games','sports','travel','health','energy','iot','location',
      'weather','education','government','realestate',
    ]);
    for (const d of listDestinations()) {
      expect(d.baseUrl.startsWith('https://')).toBe(true);
      expect(d.healthPath.startsWith('/')).toBe(true);
      expect(d.requiredCredentials.length).toBeGreaterThan(0);
      expect(kinds.has(d.kind)).toBe(true);
      for (const rc of d.requiredCredentials) {
        expect(d.optionalCredentials.includes(rc)).toBe(false);
      }
    }
  });

  it('looks up destinations and refuses unknown ids', () => {
    const tw = lookupDestination('twilio');
    expect(tw.ok).toBe(true);
    if (tw.ok) {
      expect(tw.value.authStyle).toBe('basic');
      expect(tw.value.requiredCredentials.join(',')).toBe('accountSid,authToken');
    }
    const v = lookupDestination('nope-xyz');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('destination-unknown:nope-xyz');
  });

  it('validates credentials with named refusals', () => {
    const okCreds = validateCredentials('mono', { secretKey: 'test-sk' });
    expect(okCreds.ok).toBe(true);
    if (okCreds.ok) expect(okCreds.value.credentials.secretKey).toBe('test-sk');

    const missing = validateCredentials('mono', {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('destination-missing-credential:secretKey');

    const empty = validateCredentials('mono', { secretKey: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('destination-empty-credential:secretKey');

    const unknown = validateCredentials('mono', { nope: 'x' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('destination-unknown-credential:nope');

    const tooLong = validateCredentials('mono', { secretKey: 'x'.repeat(600) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.reason).toBe('destination-credential-too-long:secretKey');
  });

  it('resolves base URLs with placeholders', () => {
    const shop = resolveBaseUrl('shopify', { store: 'acme', accessToken: 'tok' });
    expect(shop.ok).toBe(true);
    if (shop.ok) expect(shop.value.baseUrl).toBe('https://acme.myshopify.com');

    const missing = resolveBaseUrl('shopify', { accessToken: 'tok' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('destination-missing-placeholder:store');

    const invalid = resolveBaseUrl('custom-http', { host: 'bad host!' });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toBe('destination-invalid-placeholder:host');
  });

  it('accepts exactly the required credentials for every destination (sweep)', () => {
    for (const d of listDestinations()) {
      const creds: Record<string, string> = {};
      for (const rc of d.requiredCredentials) creds[rc] = 'test-' + rc;
      const v = validateCredentials(d.id, creds);
      expect(v.ok).toBe(true);
    }
  });
});
