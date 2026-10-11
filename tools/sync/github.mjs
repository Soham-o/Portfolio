// Minimal, dependency-free GitHub REST/GraphQL client.
// - read-only: only GET requests (plus GraphQL POST, which is a read query)
// - retries network errors / 5xx with exponential backoff
// - waits out short rate-limit windows, fails fast on long ones
// - never logs the token or request headers

export class GitHubError extends Error {
  constructor(message, { status, path, retryable = false } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.path = path;
    this.retryable = retryable;
  }
}

export class RateLimitError extends GitHubError {
  constructor(message, { path, resetAt } = {}) {
    super(message, { status: 403, path });
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GitHubClient {
  constructor({
    token = null,
    baseUrl = 'https://api.github.com',
    fetchImpl = globalThis.fetch,
    timeoutMs = 20000,
    maxRetries = 3,
    maxRateLimitWaitMs = 90_000,
    sleep = defaultSleep,
    logger = console,
    userAgent = 'portfolio-github-sync',
  } = {}) {
    this.token = token || null;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.maxRateLimitWaitMs = maxRateLimitWaitMs;
    this.sleep = sleep;
    this.logger = logger;
    this.userAgent = userAgent;
    this.requestCount = 0;
    this.rate = { limit: null, remaining: null, resetAt: null };
    this.oauthScopes = null; // only classic PATs report scopes
  }

  get authenticated() {
    return Boolean(this.token);
  }

  _headers(accept) {
    const h = {
      Accept: accept || 'application/vnd.github+json',
      'User-Agent': this.userAgent,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  _resolve(pathOrUrl) {
    if (/^https?:\/\//.test(pathOrUrl)) {
      // Only follow URLs on the configured API host (pagination links).
      const u = new URL(pathOrUrl);
      const base = new URL(this.baseUrl);
      if (u.host !== base.host) throw new GitHubError(`Refusing to request foreign host ${u.host}`, { path: u.pathname });
      return u.href;
    }
    return `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }

  _recordRate(headers) {
    const scopes = headers.get('x-oauth-scopes');
    if (scopes !== null && scopes !== undefined) this.oauthScopes = scopes.split(',').map((x) => x.trim()).filter(Boolean);
    const resource = headers.get('x-ratelimit-resource');
    if (resource && resource !== 'core') return;
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (limit != null) this.rate.limit = Number(limit);
    if (remaining != null) this.rate.remaining = Number(remaining);
    if (reset != null) this.rate.resetAt = new Date(Number(reset) * 1000).toISOString();
  }

  /**
   * Perform a request. Returns { status, data, headers }.
   * `allowStatus` lists non-2xx statuses that should be returned instead of thrown (e.g. [404]).
   */
  async request(pathOrUrl, { method = 'GET', accept, body, allowStatus = [], raw = false, redirect = 'follow' } = {}) {
    const url = this._resolve(pathOrUrl);
    const shortPath = new URL(url).pathname;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res;
      try {
        this.requestCount += 1;
        res = await this.fetch(url, {
          method,
          headers: { ...this._headers(accept), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          redirect,
        });
      } catch (err) {
        clearTimeout(timer);
        const reason = err.name === 'AbortError' ? `timed out after ${this.timeoutMs}ms` : err.message;
        if (attempt <= this.maxRetries) {
          this.logger.warn?.(`GitHub ${shortPath}: ${reason}; retrying (${attempt}/${this.maxRetries})`);
          await this.sleep(backoff(attempt));
          continue;
        }
        throw new GitHubError(`GitHub ${shortPath}: ${reason}`, { path: shortPath, retryable: true });
      }
      clearTimeout(timer);
      this._recordRate(res.headers);

      if (res.status >= 200 && res.status < 300) {
        if (res.status === 204) return { status: res.status, data: null, headers: res.headers };
        const data = raw ? await res.text() : await res.json();
        return { status: res.status, data, headers: res.headers };
      }

      if (allowStatus.includes(res.status)) {
        let data = null;
        try { data = await res.json(); } catch { /* empty body */ }
        return { status: res.status, data, headers: res.headers };
      }

      // Rate limiting (primary: 403/429 with remaining=0, secondary: retry-after)
      const remaining = res.headers.get('x-ratelimit-remaining');
      const retryAfter = res.headers.get('retry-after');
      if ((res.status === 403 || res.status === 429) && (remaining === '0' || retryAfter)) {
        const waitMs = retryAfter
          ? Number(retryAfter) * 1000
          : Math.max(0, Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now()) + 1000;
        if (waitMs <= this.maxRateLimitWaitMs && attempt <= this.maxRetries) {
          this.logger.warn?.(`GitHub rate limit hit on ${shortPath}; waiting ${Math.ceil(waitMs / 1000)}s`);
          await this.sleep(waitMs);
          continue;
        }
        throw new RateLimitError(`GitHub rate limit exhausted (resets ${this.rate.resetAt ?? 'unknown'})`, {
          path: shortPath,
          resetAt: this.rate.resetAt,
        });
      }

      if (res.status >= 500 && attempt <= this.maxRetries) {
        this.logger.warn?.(`GitHub ${shortPath}: HTTP ${res.status}; retrying (${attempt}/${this.maxRetries})`);
        await this.sleep(backoff(attempt));
        continue;
      }

      let message = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.message) message += `: ${j.message}`;
      } catch { /* ignore */ }
      throw new GitHubError(`GitHub ${shortPath}: ${message}`, {
        status: res.status,
        path: shortPath,
        retryable: res.status >= 500,
      });
    }
  }

  async get(path, opts) {
    return (await this.request(path, opts)).data;
  }

  /** Follow Link: rel="next" pagination. Throws if any page fails, so callers never see a partial list. */
  async paginate(path, { maxPages = 20 } = {}) {
    const out = [];
    let next = path;
    for (let page = 0; next && page < maxPages; page += 1) {
      const { data, headers } = await this.request(next);
      if (!Array.isArray(data)) throw new GitHubError(`Expected an array from ${path}`, { path });
      out.push(...data);
      next = parseNextLink(headers.get('link'));
    }
    if (next) throw new GitHubError(`Pagination for ${path} exceeded ${maxPages} pages`, { path });
    return out;
  }

  async graphql(query, variables = {}) {
    if (!this.token) throw new GitHubError('GraphQL requires a token', { path: '/graphql' });
    const { data } = await this.request('/graphql', { method: 'POST', body: { query, variables } });
    if (data?.errors?.length) {
      throw new GitHubError(`GraphQL: ${data.errors.map((e) => e.message).join('; ')}`, { path: '/graphql' });
    }
    return data.data;
  }
}

export function parseNextLink(link) {
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m) return m[1];
  }
  return null;
}

function backoff(attempt) {
  return Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

/**
 * Scopes a classic token may have for this read-only sync. Anything else (repo, public_repo, workflow,
 * write:*, admin:*, gist, user, delete_repo …) could modify GitHub state and is refused.
 */
export function writeCapableScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes.filter((s) => !(s.startsWith('read:') || s === 'user:email'));
}
