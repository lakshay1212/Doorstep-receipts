import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MINUTE } from '../src/domain/format.js';
import { buildSummary, factsFor, isGrounded, templateSummary } from '../src/domain/summary.js';
import { evaluateVisit } from '../src/domain/visit.js';
import type { Visit } from '../src/types.js';

const T0 = Date.UTC(2026, 9, 13, 9, 0);
const v: Visit = {
  id: 'v1', accountId: 'a', deviceId: 'd', title: 'Boiler service', contractor: 'Demo Plumbing',
  timeZone: 'UTC', windowStart: T0, windowEnd: T0 + 120 * MINUTE, earlyGraceMin: 15, lateGraceMin: 90,
  createdAt: 0, departureConfirmedAt: null, share: null, summary: null,
  signals: [{ id: 's', deviceId: 'd', kind: 'button_press', at: T0 + 47 * MINUTE, excluded: false }],
};
const NOW = T0 + 500 * MINUTE;
const facts = factsFor(v, evaluateVisit(v, [], NOW));

test('template summary states the facts', () => {
  const t = templateSummary(facts);
  assert.match(t, /9:47 AM/);
  assert.match(t, /Demo Plumbing/);
  assert.match(t, /inside the booked window/);
});

test('isGrounded rejects times that are not in the facts', () => {
  assert.equal(isGrounded('They arrived at 9:47 AM.', facts), true);
  assert.equal(isGrounded('They arrived at 10:15 AM.', facts), false);
});

test('uses the model when its output is grounded', async () => {
  const s = await buildSummary(facts, async () => 'Demo Plumbing reached the door at 9:47 AM.', NOW);
  assert.equal(s.source, 'bedrock');
});

test('falls back to the template when the model invents a time or fails', async () => {
  const bad = await buildSummary(facts, async () => 'They came at 10:15 AM.', NOW);
  assert.equal(bad.source, 'template');
  const boom = await buildSummary(facts, async () => { throw new Error('throttled'); }, NOW);
  assert.equal(boom.source, 'template');
  const none = await buildSummary(facts, null, NOW);
  assert.equal(none.source, 'template');
});
