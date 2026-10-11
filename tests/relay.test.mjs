// Tests for the optional webhook relay (signature validation, filtering, privacy of the dispatch payload).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleRequest, verifySignature, relevance } from '../relay/worker.mjs';

const env = { WEBHOOK_SECRET: 'shh', DISPATCH_TOKEN: 'tok', TARGET_REPO: 'Soham-o/Portfolio' };
const sign = (body, secret = env.WEBHOOK_SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
const req = (event, payload, { sig, method = 'POST' } = {}) => {
  const body = JSON.stringify(payload);
  return new Request('https://relay.example/', {
    method, body: method === 'POST' ? body : undefined,
    headers: { 'x-github-event': event, 'x-hub-signature-256': sig ?? sign(body), 'content-type': 'application/json' },
  });
};
function recorder() {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); };
  return { calls, fetchImpl };
}

test('relay: valid signature on a relevant event triggers repository_dispatch', async () => {
  const { calls, fetchImpl } = recorder();
  const res = await handleRequest(req('repository', { action: 'publicized', repository: { name: 'secret-thing', private: false } }), env, fetchImpl);
  assert.equal(res.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/Soham-o/Portfolio/dispatches');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, { event_type: 'github-sync', client_payload: { reason: 'repository.publicized' } });
  assert.doesNotMatch(calls[0].init.body, /secret-thing/, 'repository names are never forwarded');
});

test('relay: rejects missing or wrong signatures', async () => {
  const { calls, fetchImpl } = recorder();
  assert.equal((await handleRequest(req('repository', { action: 'created' }, { sig: '' }), env, fetchImpl)).status, 401);
  assert.equal((await handleRequest(req('repository', { action: 'created' }, { sig: sign('other') }), env, fetchImpl)).status, 401);
  assert.equal((await handleRequest(req('repository', { action: 'created' }, { sig: sign(JSON.stringify({ action: 'created' }), 'wrong') }), env, fetchImpl)).status, 401);
  assert.equal(calls.length, 0);
  assert.equal(await verifySignature('k', 'b', 'sha1=abc'), false);
});

test('relay: ignores irrelevant events and private-repo activity, allows privacy transitions', async () => {
  assert.equal(relevance('star', { action: 'created' }), null);
  assert.equal(relevance('repository', { action: 'created', repository: { private: true } }), null);
  assert.equal(relevance('repository', { action: 'privatized', repository: { private: true } }), 'repository.privatized');
  assert.equal(relevance('push', { ref: 'refs/heads/feature', repository: { private: false, default_branch: 'main' } }), null);
  assert.equal(relevance('push', { ref: 'refs/heads/main', repository: { private: false, default_branch: 'main' } }), 'push');
  assert.equal(relevance('push', { ref: 'refs/heads/main', repository: { private: true, default_branch: 'main' } }), null);
  assert.equal(relevance('release', { action: 'published', repository: { private: false } }), 'release.published');
  const { calls, fetchImpl } = recorder();
  const res = await handleRequest(req('ping', { zen: 'x' }), env, fetchImpl);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('relay: method and configuration checks', async () => {
  const { fetchImpl } = recorder();
  assert.equal((await handleRequest(req('repository', {}, { method: 'GET' }), env, fetchImpl)).status, 405);
  assert.equal((await handleRequest(req('repository', { action: 'created' }), { ...env, TARGET_REPO: 'bad repo' }, fetchImpl)).status, 500);
  const failing = async () => new Response('no', { status: 403 });
  assert.equal((await handleRequest(req('repository', { action: 'created', repository: {} }), env, failing)).status, 502);
});
