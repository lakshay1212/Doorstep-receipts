import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MINUTE } from '../src/domain/format.js';
import { signBody } from '../src/ring/verify.js';
import { buildRingWebhook } from '../src/simulator.js';
import { Store } from '../src/store.js';

let clock = Date.UTC(2026, 9, 13, 12, 0);
let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
const config = loadConfig({ DASHBOARD_API_KEY: 'secret', ENABLE_SIMULATOR: 'true' } as NodeJS.ProcessEnv);

before(async () => {
  const app = createApp({ config, store: new Store(':memory:'), now: () => clock, converse: null });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const H = { 'content-type': 'application/json', 'x-dashboard-key': 'secret' };
const api = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const post = (path: string, body: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });

async function webhook(over: Parameters<typeof buildRingWebhook>[0], key = config.signingKey) {
  const raw = JSON.stringify(buildRingWebhook(over));
  return fetch(base + '/webhooks/ring', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': signBody(key, raw) },
    body: raw,
  });
}

let visitId = '';
const window = { start: clock - 30 * MINUTE, end: clock + 60 * MINUTE };

test('dashboard API requires the key, config and receipts do not', async () => {
  assert.equal((await fetch(base + '/api/visits')).status, 401);
  assert.equal((await fetch(base + '/api/config')).status, 200);
});

test('creates a visit and validates input', async () => {
  const bad = await post('/api/visits', { title: 'x', contractor: 'y', deviceId: 'd', windowStart: 10, windowEnd: 5 });
  assert.equal(bad.status, 400);
  const ok = await post('/api/visits', {
    title: 'Boiler service', contractor: 'Demo Plumbing', deviceId: 'sim-doorbell-front',
    timeZone: 'UTC', windowStart: window.start, windowEnd: window.end,
  });
  assert.equal(ok.status, 201);
  const v = (await ok.json()) as { id: string; phase: string };
  visitId = v.id;
  assert.equal(v.phase, 'watching');
});

test('rejects webhooks with a bad signature and malformed bodies', async () => {
  const forged = await webhook({ accountId: config.demoAccountId, deviceId: 'sim-doorbell-front', type: 'button_press', at: clock - 1000 }, 'wrong-key');
  assert.equal(forged.status, 401);
  const raw = '{"nope":true}';
  const res = await fetch(base + '/webhooks/ring', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': signBody(config.signingKey, raw) },
    body: raw,
  });
  assert.equal(res.status, 400);
});

test('keeps an in-window doorbell press, dedupes redelivery, and discards outside signals', async () => {
  const payload = { accountId: config.demoAccountId, deviceId: 'sim-doorbell-front', type: 'button_press' as const, at: clock - 5 * MINUTE, requestId: 'req-1' };
  const first = (await (await webhook(payload)).json()) as { kept: boolean };
  assert.equal(first.kept, true);
  const again = (await (await webhook(payload)).json()) as { status: string };
  assert.equal(again.status, 'duplicate');

  await webhook({ accountId: config.demoAccountId, deviceId: 'sim-doorbell-front', type: 'motion_detected', subType: 'human', at: clock - 3 * 24 * 60 * MINUTE });
  await webhook({ accountId: config.demoAccountId, deviceId: 'sim-doorbell-front', type: 'motion_detected', at: clock - 2 * MINUTE }); // non-human motion
  const privacy = (await (await api('/api/privacy')).json()) as { kept: number; discarded: number };
  assert.equal(privacy.kept, 1);
  assert.equal(privacy.discarded, 2);

  const v = (await (await api(`/api/visits/${visitId}`)).json()) as { signals: unknown[]; outcome: string; phase: string };
  assert.equal(v.signals.length, 1);
  assert.equal(v.outcome, 'on_time');
  assert.equal(v.phase, 'arrived');
});

test('share link shows a receipt without internal ids, then expires and can be revoked', async () => {
  const shared = (await (await post(`/api/visits/${visitId}/share`, { days: 1 })).json()) as { share: { url: string } };
  const token = shared.share.url.split('/r/')[1]!;

  const page = await fetch(`${base}/r/${token}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Boiler service/);
  assert.match(html, /In the window/);
  assert.doesNotMatch(html, /sim-doorbell-front/);
  assert.doesNotMatch(html, new RegExp(config.demoAccountId));
  const json = JSON.stringify(await (await fetch(`${base}/api/receipts/${token}`)).json());
  assert.doesNotMatch(json, /sim-doorbell-front/);

  clock += 2 * 24 * 60 * MINUTE; // past expiry
  assert.equal((await fetch(`${base}/r/${token}`)).status, 410);
  clock -= 2 * 24 * 60 * MINUTE;
  assert.equal((await fetch(`${base}/r/${token}`)).status, 200);

  await api(`/api/visits/${visitId}/share`, { method: 'DELETE' });
  assert.equal((await fetch(`${base}/r/${token}`)).status, 410);
  assert.equal((await fetch(`${base}/r/not-a-token`)).status, 404);
});

test('homeowner can exclude a signal and confirm departure', async () => {
  const v = (await (await api(`/api/visits/${visitId}`)).json()) as { signals: Array<{ id: string }> };
  const id = encodeURIComponent(v.signals[0]!.id);
  const excluded = (await (await post(`/api/visits/${visitId}/signals/${id}/exclude`)).json()) as { outcome: string; phase: string };
  assert.notEqual(excluded.outcome, 'on_time'); // now pending: window still open and nobody counted
  assert.equal((await post(`/api/visits/${visitId}/confirm-departure`)).status, 409);
  await post(`/api/visits/${visitId}/signals/${id}/exclude`, { excluded: false });
  const left = (await (await post(`/api/visits/${visitId}/confirm-departure`)).json()) as { departureLabel: string; onSiteLabel: string };
  assert.ok(left.departureLabel);
  assert.match(left.onSiteLabel, /confirmed/);
});

test('summary falls back to the template when no model is configured', async () => {
  const v = (await (await post(`/api/visits/${visitId}/summary`)).json()) as { summary: { source: string; text: string } };
  assert.equal(v.summary.source, 'template');
  assert.match(v.summary.text, /Demo Plumbing/);
});

test('simulator: an ended demo visit can show a late arrival through the real webhook pipeline', async () => {
  const demo = (await (await post('/api/dev/demo-visit', { kind: 'ended', timeZone: 'UTC' })).json()) as { id: string };
  const sim = await post('/api/dev/simulate', { visitId: demo.id, scenario: 'arrive_late' });
  assert.equal(sim.status, 200);
  const body = (await sim.json()) as { sent: Array<{ http: number }>; visit: { outcome: string } };
  assert.ok(body.sent.every((s) => s.http === 200));
  assert.equal(body.visit.outcome, 'late');

  const open = (await (await post('/api/dev/demo-visit', { kind: 'open', timeZone: 'UTC' })).json()) as { id: string };
  const tooSoon = await post('/api/dev/simulate', { visitId: open.id, scenario: 'arrive_late' });
  assert.equal(tooSoon.status, 409);
});

test('simulator: camera offline during an ended visit makes the result inconclusive', async () => {
  const demo = (await (await post('/api/dev/demo-visit', { kind: 'ended', timeZone: 'UTC' })).json()) as { id: string };
  await post('/api/dev/simulate', { visitId: demo.id, scenario: 'camera_offline' });
  const v = (await (await api(`/api/visits/${demo.id}`)).json()) as { outcome: string };
  assert.equal(v.outcome, 'inconclusive_offline');
});

test('smart lock toggle revokes and restores keypad access', async () => {
  const v = (await (await post(`/api/visits/${visitId}/smart-lock/toggle`)).json()) as { smartLock: { state: string } };
  assert.equal(v.smartLock.state, 'revoked');
  const restored = (await (await post(`/api/visits/${visitId}/smart-lock/toggle`)).json()) as { smartLock: { state: string } };
  assert.equal(restored.smartLock.state, 'locked');
});

test('dispatches business webhooks and logs events', async () => {
  const res = await post(`/api/visits/${visitId}/business-dispatch`, { platform: 'Jobber' });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { event: { platform: string; eventType: string } };
  assert.equal(data.event.platform, 'Jobber');
  assert.ok(data.event.eventType);

  const list = (await (await api('/api/business-events')).json()) as Array<{ platform: string }>;
  assert.ok(list.length >= 1);
  assert.equal(list[0]!.platform, 'Jobber');
});

test('runs Bedrock dispute audit and attaches analysis', async () => {
  const res = await post(`/api/visits/${visitId}/dispute`, { claim: 'I arrived at 9:15 AM' });
  assert.equal(res.status, 200);
  const v = (await res.json()) as { dispute: { verdict: string; analysis: string; evidenceReferences: string[] } };
  assert.ok(v.dispute.verdict);
  assert.ok(v.dispute.analysis);
  assert.ok(Array.isArray(v.dispute.evidenceReferences));
});

test('verifies evidence integrity cryptographically and detects tampering', async () => {
  const check = (await (await api(`/api/visits/${visitId}/verify-integrity`)).json()) as { verified: boolean; algorithm: string };
  assert.equal(check.verified, true);
  assert.equal(check.algorithm, 'HMAC-SHA256');

  // Verify failure when given a bad expected hash
  const badCheck = (await (await api(`/api/visits/${visitId}/verify-integrity?expected=bad-digest`)).json()) as { verified: boolean; failureReason: string };
  assert.equal(badCheck.verified, false);
  assert.ok(badCheck.failureReason.includes('mismatch'));
});

test('deleting a visit removes it and its signals', async () => {
  assert.equal((await api(`/api/visits/${visitId}`, { method: 'DELETE' })).status, 204);
  assert.equal((await api(`/api/visits/${visitId}`)).status, 404);
});
