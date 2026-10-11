// OPTIONAL near-real-time trigger.
//
// GitHub has no account-wide webhook, so instant updates need a GitHub App (installed on all your
// repositories) whose webhook points here. This tiny relay verifies the webhook signature and then
// asks the portfolio repository to run its sync workflow via `repository_dispatch`.
//
// It never forwards repository names or content — the sync workflow re-reads everything from the
// public API, so a private repository's details can't leak into public workflow logs.
//
// Runs on any Fetch-API runtime: Cloudflare Workers (free tier), Deno Deploy, Vercel Edge, Netlify Edge.
// Required environment variables / secrets:
//   WEBHOOK_SECRET   – the GitHub App's webhook secret
//   DISPATCH_TOKEN   – fine-grained PAT limited to the portfolio repo, permission "Contents: Read and write"
//   TARGET_REPO      – "owner/portfolio-repo"

export const RELEVANT = {
  repository: ['created', 'deleted', 'archived', 'unarchived', 'edited', 'renamed', 'transferred', 'publicized', 'privatized'],
  release: ['published', 'released', 'edited', 'deleted', 'unpublished'],
  public: null, // any action
  push: null,   // filtered to default-branch pushes of public repos below
  installation_repositories: ['added', 'removed'],
};

const enc = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(secret, body, header) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return timingSafeEqual(`sha256=${hex(sig)}`, header);
}

/** Decide whether an event should trigger a sync. Returns a short, non-identifying reason or null. */
export function relevance(event, payload) {
  if (!(event in RELEVANT)) return null;
  const actions = RELEVANT[event];
  if (actions && !actions.includes(payload?.action)) return null;
  if (event === 'push') {
    const repo = payload?.repository;
    if (!repo || repo.private) return null;
    const branch = `refs/heads/${repo.default_branch || repo.master_branch || 'main'}`;
    if (payload.ref !== branch) return null;
  }
  // Ignore activity in still-private repositories, except the transitions that matter for privacy.
  if (event === 'repository' && payload?.repository?.private && !['privatized', 'deleted'].includes(payload.action)) return null;
  if (event === 'release' && payload?.repository?.private) return null;
  return `${event}${payload?.action ? `.${payload.action}` : ''}`;
}

const MAX_BODY = 5 * 1024 * 1024;

export async function handleRequest(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.WEBHOOK_SECRET || !env.DISPATCH_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.TARGET_REPO || '')) {
    return new Response('Relay not configured', { status: 500 });
  }
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return new Response('Payload too large', { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response('Payload too large', { status: 413 });

  const ok = await verifySignature(env.WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256'));
  if (!ok) return new Response('Invalid signature', { status: 401 });

  const event = request.headers.get('x-github-event') || '';
  if (event === 'ping') return new Response('pong', { status: 200 });
  let payload;
  try { payload = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }

  const reason = relevance(event, payload);
  if (!reason) return new Response('Ignored', { status: 202 });

  const res = await fetchImpl(`https://api.github.com/repos/${env.TARGET_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.DISPATCH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'portfolio-sync-relay',
      'Content-Type': 'application/json',
    },
    // Only a coarse reason is sent — never names, descriptions or content.
    body: JSON.stringify({ event_type: 'github-sync', client_payload: { reason } }),
  });
  if (res.status !== 204) return new Response(`Dispatch failed (${res.status})`, { status: 502 });
  return new Response('Sync triggered', { status: 202 });
}

export default {
  fetch: (request, env) => handleRequest(request, env),
};
