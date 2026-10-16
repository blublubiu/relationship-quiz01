import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';
import { getPartnerContent, CONTENT_VERSION } from '../supabase/functions/quiz-api/partner-content.ts';
import { getQuizContent } from '../supabase/functions/quiz-api/quiz-content.ts';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/quiz-api/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''), { mode: 'strip' });
function makeHandler(rpcResults = [{ ok: true, remaining: 4 }]) {
  let handler, calls = 0;
  const db = { rpc: async () => ({ data: rpcResults[Math.min(calls++, rpcResults.length - 1)], error: null }), from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { max_uses: 5, used_count: 0, disabled_at: null }, error: null }) }) };
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-unit-test', ALLOWED_ORIGINS: 'https://relationship-quiz01.pages.dev' };
  vm.runInNewContext(source, { createClient: () => db, getQuizContent, getPartnerContent, CONTENT_VERSION, Deno: { env: { get: key => env[key] }, serve: value => { handler = value; } }, TextEncoder, Headers, Response, URL, crypto: webcrypto, btoa, console: { error() {} } });
  return { handler, calls: () => calls };
}
const request = (body, method = 'POST', origin = 'https://relationship-quiz01.pages.dev', path = '/api/start') => new Request('https://example.invalid/functions/v1/quiz-api' + path, { method, headers: { origin, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });

test('new entry consumes once and returns all 12 questions and six reports in the same response', async () => {
  const api = makeHandler(), response = await api.handler(request({ code: 'ABCD-EFGH-2345', content_version: CONTENT_VERSION }));
  assert.equal(response.status, 200); const body = await response.json();
  assert.equal(api.calls(), 1); assert.equal(body.remaining, 4);
  assert.equal(body.content.version, CONTENT_VERSION); assert.equal(body.content.questions.length, 12); assert.equal(body.content.results.length, 6);
});
test('version mismatch and malformed passwords are rejected before consuming a use', async () => {
  const api = makeHandler();
  assert.equal((await api.handler(request({ code: 'ABCD-EFGH-2345', content_version: 'old' }))).status, 409);
  assert.equal((await api.handler(request({ code: '123', content_version: CONTENT_VERSION }))).status, 400);
  assert.equal(api.calls(), 0);
});
test('exhausted passwords never receive paid question content', async () => {
  const api = makeHandler([{ ok: false, reason: 'exhausted' }]);
  const response = await api.handler(request({ code: 'ABCD-EFGH-2345', content_version: CONTENT_VERSION }));
  assert.equal(response.status, 403); assert.equal((await response.json()).content, undefined);
});
test('legacy displayed-code hashes still work without exposing content before a successful consume', async () => {
  const api = makeHandler([{ ok: false, reason: 'invalid' }, { ok: true, remaining: 2 }]);
  const response = await api.handler(request({ code: 'ABCD-EFGH-2345', content_version: CONTENT_VERSION }));
  assert.equal(response.status, 200); assert.equal(api.calls(), 2); assert.equal((await response.json()).remaining, 2);
});
test('CORS preflight has no body and allowed origins receive the correct header', async () => {
  const api = makeHandler(), response = await api.handler(request(null, 'OPTIONS'));
  assert.equal(response.status, 204); assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://relationship-quiz01.pages.dev'); assert.equal(api.calls(), 0);
});
test('unknown origins are rejected before a database operation', async () => {
  const api = makeHandler(), response = await api.handler(request({ code: 'ABCD-EFGH-2345', content_version: CONTENT_VERSION }, 'POST', 'https://untrusted.invalid'));
  assert.equal(response.status, 403); assert.equal(api.calls(), 0);
});
test('the deployed legacy frontend can finish its previous flow during the rollout', async () => {
  const api = makeHandler();
  const access = await api.handler(request({ code: 'ABCD-EFGH-2345' }, 'POST', 'https://relationship-quiz01.pages.dev', '/api/access'));
  assert.equal(access.status, 200); assert.ok((await access.json()).content.relationshipReports); assert.equal(api.calls(), 0);
  const start = await api.handler(request({ code: 'ABCD-EFGH-2345' }));
  assert.equal(start.status, 200); assert.equal((await start.json()).content, undefined); assert.equal(api.calls(), 1);
});
