import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MINUTE } from '../src/domain/format.js';
import { Store } from '../src/store.js';

const clock = Date.UTC(2026, 9, 16, 12, 0);
let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
const config = loadConfig({ MAX_VISITS: '2', ENABLE_SIMULATOR: 'true' } as NodeJS.ProcessEnv);

before(async () => {
  server = createApp({ config, store: new Store(':memory:'), now: () => clock, converse: null }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const json = { 'content-type': 'application/json' };
const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });
const visitBody = {
  title: 'Gutter clean', contractor: 'Demo Co', deviceId: 'sim-doorbell-front', timeZone: 'UTC',
  windowStart: clock - 30 * MINUTE, windowEnd: clock + 60 * MINUTE,
};

test('health check answers without auth', async () => {
  const res = await fetch(base + '/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('share links use https when a proxy says the request was https', async () => {
  const v = (await (await post('/api/visits', visitBody)).json()) as { id: string };
  const shared = (await (await post(`/api/visits/${v.id}/share`, {}, { 'x-forwarded-proto': 'https' })).json()) as { share: { url: string } };
  assert.match(shared.share.url, /^https:\/\//);
});

test('simulator availability explains why a scenario cannot run', async () => {
  const open = (await (await post('/api/dev/demo-visit', { kind: 'open', timeZone: 'UTC' })).json()) as { sim: Record<string, string | null> };
  assert.equal(typeof open.sim.arrive_late, 'string');
  assert.equal(open.sim.arrive_on_time, null);
  await post('/api/dev/reset');
  const ended = (await (await post('/api/dev/demo-visit', { kind: 'ended', timeZone: 'UTC' })).json()) as { sim: Record<string, string | null> };
  assert.equal(ended.sim.arrive_late, null);
});

test('visit count is capped', async () => {
  await post('/api/dev/reset');
  assert.equal((await post('/api/visits', visitBody)).status, 201);
  assert.equal((await post('/api/visits', visitBody)).status, 201);
  assert.equal((await post('/api/visits', visitBody)).status, 429);
  assert.equal((await post('/api/dev/demo-visit', { kind: 'open' })).status, 429);
});

test('reset wipes visits and counters', async () => {
  assert.equal((await post('/api/dev/reset')).status, 204);
  assert.deepEqual(await (await fetch(base + '/api/visits')).json(), []);
  assert.deepEqual(await (await fetch(base + '/api/privacy')).json().then((p: any) => [p.kept, p.discarded]), [0, 0]);
});
