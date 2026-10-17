// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/url-policy.ts
// ============================================================================
// The SSRF wall. Every universal-egress call target passes through here
// BEFORE any socket is opened. Private ranges, loopback, link-local, cloud
// metadata endpoints, exotic bypass encodings — all refused by name. The
// engine is pure: it decides from the URL string alone, no DNS, no clock.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface NormalizedTarget {
  scheme: string;
  host: string;
  port: number;
  path: string;
  origin: string;
}

const ALLOWED_SCHEMES = ['https'];
const ALLOWED_PORTS = [443];
const MAX_HOST_LENGTH = 253;
const MAX_QUERY_LENGTH = 2048;
const MAX_PATH_LENGTH = 1024;

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

// Rejects IPv4 literals that point at private, loopback, link-local or
// otherwise non-routable space — including the cloud metadata IPs.
export function checkIpv4Literal(ip: string): Verdict<{ public: true }> {
  const n = ipv4ToInt(ip);
  if (n === null) return { ok: false, reason: 'url-invalid-ipv4' };
  const ranges: Array<[string, number, number]> = [
    ['url-loopback-address', 0x7f000000, 0x7fffffff],
    ['url-private-address', 0x0a000000, 0x0affffff],
    ['url-private-address', 0xac100000, 0xac1fffff],
    ['url-private-address', 0xc0a80000, 0xc0a8ffff],
    ['url-link-local-address', 0xa9fe0000, 0xa9feffff],
    ['url-unspecified-address', 0x00000000, 0x00000000],
    ['url-reserved-address', 0xe0000000, 0xffffffff],
  ];
  for (const [reason, lo, hi] of ranges) {
    if (n >= lo && n <= hi) return { ok: false, reason };
  }
  if (n === 0xa9fea9fe) return { ok: false, reason: 'url-metadata-endpoint' };
  return { ok: true, value: { public: true } };
}

// IPv6 literal guard: loopback, ULA, link-local, mapped-v4 private.
export function checkIpv6Literal(ip: string): Verdict<{ public: true }> {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return { ok: false, reason: 'url-loopback-address' };
  if (v.startsWith('fe80:') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) {
    return { ok: false, reason: 'url-link-local-address' };
  }
  if (v.startsWith('fc') || v.startsWith('fd')) return { ok: false, reason: 'url-private-address' };
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return checkIpv4Literal(mapped[1]);
  return { ok: true, value: { public: true } };
}

// Decimal, octal, hex and mixed IPv4 encodings (0x7f.0.0.1, 2130706433,
// 0177.0.0.1, 0x7f000001) are classic SSRF bypasses — normalized to
// dotted-quad, then checked.
export function normalizeIpv4Bypass(host: string): Verdict<string> {
  if (/^0x[0-9a-f]+$/i.test(host) && host.length <= 10) {
    const n = parseInt(host.slice(2), 16) >>> 0;
    return { ok: true, value: [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.') };
  }
  if (/^(0x[0-9a-f]+|[0-9a-f]+)(\.(0x[0-9a-f]+|[0-9a-f]+)){1,3}$/i.test(host) && /[x]/i.test(host)) {
    const parts = host.split('.').map((p) => (/^0x/i.test(p) ? parseInt(p.slice(2), 16) : parseInt(p, 16)));
    if (parts.length !== 4) return { ok: false, reason: 'url-invalid-ipv4' };
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
      return { ok: false, reason: 'url-invalid-ipv4' };
    }
    return { ok: true, value: parts.join('.') };
  }
  if (/^\d{8,10}$/.test(host)) {
    const n = Number(host) >>> 0;
    return { ok: true, value: [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.') };
  }
  const octal = host.match(/^(0\d{1,3})(\.0?\d{1,3}){1,3}$/);
  if (octal) {
    const parts = host.split('.').map((p) => (p.startsWith('0') && p.length > 1 ? parseInt(p, 8) : Number(p)));
    if (parts.length !== 4) return { ok: false, reason: 'url-invalid-ipv4' };
    if (parts.some((p) => !Number.isInteger(p) || p > 255)) return { ok: false, reason: 'url-invalid-ipv4' };
    return { ok: true, value: parts.join('.') };
  }
  return { ok: false, reason: 'url-not-a-bypass-encoding' };
}

export function normalizeTarget(rawUrl: string): Verdict<NormalizedTarget> {
  if (typeof rawUrl !== 'string' || !rawUrl.length) return { ok: false, reason: 'url-empty' };
  if (rawUrl.length > 2048) return { ok: false, reason: 'url-too-long' };
  if (/[\u0000-\u001f\u007f]/.test(rawUrl)) return { ok: false, reason: 'url-control-characters' };
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'url-unparseable' };
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (!ALLOWED_SCHEMES.includes(scheme)) {
    return { ok: false, reason: 'url-scheme-not-allowed:' + scheme };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.length) return { ok: false, reason: 'url-no-host' };
  if (host.length > MAX_HOST_LENGTH) return { ok: false, reason: 'url-host-too-long' };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'url-userinfo-forbidden' };
  }
  const port = parsed.port ? Number(parsed.port) : 443;
  if (!ALLOWED_PORTS.includes(port)) {
    return { ok: false, reason: 'url-port-not-allowed:' + parsed.port };
  }
  if (parsed.pathname.length > MAX_PATH_LENGTH) return { ok: false, reason: 'url-path-too-long' };
  if (parsed.search.length > MAX_QUERY_LENGTH) return { ok: false, reason: 'url-query-too-long' };
  if (parsed.hash) return { ok: false, reason: 'url-fragment-forbidden' };
  // Literal-address checks (bypass encodings first).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const check = checkIpv4Literal(host);
    if (!check.ok) return check;
  } else if (/^[0-9a-fx.]+$/i.test(host) && host.includes('0x')) {
    const norm = normalizeIpv4Bypass(host);
    if (norm.ok) {
      const check = checkIpv4Literal(norm.value);
      if (!check.ok) return check;
      return { ok: false, reason: 'url-encoded-literal' };
    }
  } else if (/^\d{8,10}$/.test(host)) {
    const norm = normalizeIpv4Bypass(host);
    if (norm.ok) {
      const check = checkIpv4Literal(norm.value);
      if (!check.ok) return check;
      return { ok: false, reason: 'url-encoded-literal' };
    }
  } else if (/^0\d{1,3}(\.0?\d{1,3}){1,3}$/.test(host)) {
    const norm = normalizeIpv4Bypass(host);
    if (norm.ok) {
      const check = checkIpv4Literal(norm.value);
      if (!check.ok) return check;
      return { ok: false, reason: 'url-encoded-literal' };
    }
  } else if (host.includes(':')) {
    const check = checkIpv6Literal(host);
    if (!check.ok) return check;
  } else if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) {
    return { ok: false, reason: 'url-local-hostname' };
  }
  return {
    ok: true,
    value: { scheme, host, port, path: parsed.pathname, origin: parsed.origin },
  };
}
