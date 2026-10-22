import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRingWebhook, PayloadError } from '../src/ring/normalize.js';
import { buildRingWebhook } from '../src/simulator.js';

const base = { accountId: 'ava1.ring.account.T', deviceId: 'dev1', at: 1_770_989_995_231 };

test('button_press becomes a button_press signal', () => {
  const ev = normalizeRingWebhook(buildRingWebhook({ ...base, type: 'button_press' }));
  assert.equal(ev.type, 'signal');
  if (ev.type === 'signal') {
    assert.equal(ev.kind, 'button_press');
    assert.equal(ev.deviceId, 'dev1');
    assert.equal(ev.at, base.at);
    assert.equal(ev.eventId, `dev1_button_press_${base.at}`);
  }
});

test('motion_detected with subType human is a person; without it is other motion', () => {
  const human = normalizeRingWebhook(buildRingWebhook({ ...base, type: 'motion_detected', subType: 'human' }));
  const other = normalizeRingWebhook(buildRingWebhook({ ...base, type: 'motion_detected' }));
  assert.equal(human.type === 'signal' && human.kind, 'motion_human');
  assert.equal(other.type === 'signal' && other.kind, 'motion_other');
});

test('reads subType from attributes as a fallback', () => {
  const p = buildRingWebhook({ ...base, type: 'motion_detected' }) as any;
  p.data.attributes.sub_type = 'human';
  const ev = normalizeRingWebhook(p);
  assert.equal(ev.type === 'signal' && ev.kind, 'motion_human');
});

test('device_offline and device_online become status changes', () => {
  const off = normalizeRingWebhook(buildRingWebhook({ ...base, type: 'device_offline' }));
  const on = normalizeRingWebhook(buildRingWebhook({ ...base, type: 'device_online' }));
  assert.equal(off.type === 'device_status' && off.status, 'offline');
  assert.equal(on.type === 'device_status' && on.status, 'online');
});

test('unknown event types are ignored, not errors', () => {
  const p = buildRingWebhook({ ...base, type: 'button_press' }) as any;
  p.data.type = 'subscription_activated';
  assert.equal(normalizeRingWebhook(p).type, 'ignored');
});

test('malformed payloads throw PayloadError', () => {
  assert.throws(() => normalizeRingWebhook({}), PayloadError);
  assert.throws(() => normalizeRingWebhook(null), PayloadError);
  const p = buildRingWebhook({ ...base, type: 'button_press' }) as any;
  delete p.data.attributes.timestamp;
  assert.throws(() => normalizeRingWebhook(p), PayloadError);
  const q = buildRingWebhook({ ...base, type: 'button_press' }) as any;
  delete q.meta.request_id;
  assert.throws(() => normalizeRingWebhook(q), PayloadError);
});
