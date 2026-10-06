// ============================================================================
// FILE: /apps/api/src/egress/adapters/http.adapters.ts
// ============================================================================
// Concrete HTTP transports for the scanner sources. Every adapter receives
// { method, path, params, body, timeoutMs, maxResponseBytes } and returns
// parsed JSON — the gateway adds rate limiting, circuit breaking, and
// audit on top. Credentials come from env (platform keys) — never inline.
// NOTE: fetch with AbortController enforces the timeout contract.

export interface AdapterRequest {
  method: string;
  path: string;
  params?: Record<string, any>;
  body?: Record<string, any>;
  timeoutMs: number;
  maxResponseBytes?: number;
}

export interface AdapterConfig {
  baseUrl: string;
  headers?: Record<string, string>;
}

export function makeHttpAdapter(config: AdapterConfig) {
  return async (req: AdapterRequest): Promise<any> => {
    const url = new URL(config.baseUrl + req.path);
    if (req.params) {
      for (const [k, v] of Object.entries(req.params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        method: req.method,
        signal: controller.signal,
        headers: { accept: 'application/json', ...(config.headers || {}) },
        body: req.body ? JSON.stringify(req.body) : undefined,
      });
      if (!response.ok) {
        throw new Error(config.baseUrl + ' responded ' + response.status);
      }
      const text = await response.text();
      if (req.maxResponseBytes && text.length > req.maxResponseBytes) {
        throw new Error('Response exceeded max allowed size');
      }
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function buildAdapterRegistry(env: NodeJS.ProcessEnv): Map<string, AdapterConfig> {
  const registry = new Map<string, AdapterConfig>();

  if (env.EGRESS_REDDIT_CLIENT_ID) {
    // Reddit OAuth: app-only token fetched per request cycle by the adapter;
    // read-only public endpoints kept simple via explicit auth headers.
    registry.set('reddit', {
      baseUrl: 'https://oauth.reddit.com',
      headers: {
        'User-Agent': 'ForgeNova/0.1 (scanner)',
        Authorization: 'Bearer ' + (env.EGRESS_REDDIT_TOKEN || ''),
      },
    });
  }

  if (env.EGRESS_GITHUB_TOKEN) {
    registry.set('github', {
      baseUrl: 'https://api.github.com',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + env.EGRESS_GITHUB_TOKEN,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  }

  if (env.EGRESS_GOOGLE_API_KEY && env.EGRESS_GOOGLE_SEARCH_CX) {
    registry.set('google_search', {
      baseUrl: 'https://www.googleapis.com',
      headers: {},
    });
    // key and cx are appended as params by the destination-specific wrapper.
  }

  if (env.EGRESS_TWITTER_BEARER_TOKEN) {
    registry.set('twitter', {
      baseUrl: 'https://api.twitter.com/2',
      headers: { Authorization: 'Bearer ' + env.EGRESS_TWITTER_BEARER_TOKEN },
    });
  }

  if (env.EGRESS_TRENDS_BASE_URL) {
    registry.set('google_trends', {
      baseUrl: env.EGRESS_TRENDS_BASE_URL,
      headers: { 'X-Api-Key': env.EGRESS_TRENDS_API_KEY || '' },
    });
  }

  return registry;
}
