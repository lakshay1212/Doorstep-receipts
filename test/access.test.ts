import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSmartLock } from '../src/domain/access.js';
import { generateVerificationSeal, verifyEvidenceIntegrity } from '../src/domain/verification.js';
import { createBusinessEvent } from '../src/domain/business.js';
import { templateDisputeAudit } from '../src/domain/dispute.js';
import { factsFor } from '../src/domain/summary.js';
import { evaluateVisit } from '../src/domain/visit.js';
import type { Visit } from '../src/types.js';

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'test-visit-12345678',
    accountId: 'acc1',
    deviceId: 'dev1',
    title: 'Boiler service',
    contractor: 'Apex Plumbing',
    timeZone: 'UTC',
    windowStart: T0,
    windowEnd: T0 + 60 * MINUTE,
    earlyGraceMin: 15,
    lateGraceMin: 90,
    createdAt: T0 - 120 * MINUTE,
    signals: [],
    departureConfirmedAt: null,
    share: null,
    summary: null,
    ...overrides,
  };
}

test('smart lock access is ACTIVE only when arrival is on_time inside window', () => {
  const v = makeVisit({
    signals: [{ id: 's1', deviceId: 'dev1', kind: 'button_press', at: T0 + 10 * MINUTE, excluded: false }],
  });
  const ev = evaluateVisit(v, [], T0 + 15 * MINUTE);
  const lock = evaluateSmartLock(v, ev, T0 + 15 * MINUTE);

  assert.equal(lock.state, 'active');
  assert.match(lock.pin, /^\d{4}$/);
});

test('smart lock access is LOCKED when arrival is late', () => {
  const v = makeVisit({
    signals: [{ id: 's1', deviceId: 'dev1', kind: 'button_press', at: T0 + 75 * MINUTE, excluded: false }],
  });
  const ev = evaluateVisit(v, [], T0 + 80 * MINUTE);
  const lock = evaluateSmartLock(v, ev, T0 + 80 * MINUTE);

  assert.equal(lock.state, 'locked');
  assert.equal(lock.pin, '••••');
});

test('verification seal generates tamper-proof HMAC digest and detects altered records', () => {
  const v = makeVisit();
  const ev = evaluateVisit(v, [], T0);
  const key = 'test-secret-key';
  const seal = generateVerificationSeal(v, ev, key);

  assert.equal(seal.algorithm, 'HMAC-SHA256');
  assert.equal(seal.verified, true);
  assert.ok(seal.digest.length === 64);
  assert.ok(seal.fingerprint.includes('...'));

  // Test 1: Authentic record verifies successfully
  const validCheck = verifyEvidenceIntegrity(v, ev, seal.digest, key);
  assert.equal(validCheck.verified, true);
  assert.equal(validCheck.failureReason, undefined);

  // Test 2: Altered contractor name or window fails verification
  const alteredVisit = { ...v, contractor: 'Forged Contractor' };
  const alteredCheck = verifyEvidenceIntegrity(alteredVisit, ev, seal.digest, key);
  assert.equal(alteredCheck.verified, false);
  assert.match(alteredCheck.failureReason!, /altered/);

  // Test 3: Forged digest fails verification
  const forgedCheck = verifyEvidenceIntegrity(v, ev, 'deadbeef'.repeat(8), key);
  assert.equal(forgedCheck.verified, false);
});

test('business event generates structured payload for Jobber / Stripe', () => {
  const v = makeVisit({
    signals: [{ id: 's1', deviceId: 'dev1', kind: 'button_press', at: T0 + 10 * MINUTE, excluded: false }],
  });
  const ev = evaluateVisit(v, [], T0 + 15 * MINUTE);
  const evt = createBusinessEvent(v, ev, 'Jobber', T0 + 15 * MINUTE);

  assert.equal(evt.eventType, 'arrival.verified');
  assert.equal(evt.platform, 'Jobber');
  assert.equal(evt.status, 'delivered');
  assert.equal((evt.payload.data as any).action, 'release_escrow_deposit');
});

test('dispute arbiter gives Inconclusive verdict when camera was offline', () => {
  const v = makeVisit();
  const ev = evaluateVisit(v, [{ deviceId: 'dev1', status: 'offline', at: T0 - 15 * MINUTE }], T0 + 160 * MINUTE);
  const facts = factsFor(v, ev);
  const audit = templateDisputeAudit(v, ev, facts, 'I came at 10:15 but camera was dead', T0 + 165 * MINUTE);

  assert.equal(audit.verdict, 'Inconclusive');
  assert.ok(audit.analysis.includes('offline'));
  assert.ok(audit.evidenceReferences.length > 0);
  assert.ok(audit.limitations.length > 0);
});

test('dispute arbiter gives Supported verdict when arrival is verified in-window', () => {
  const v = makeVisit({
    signals: [{ id: 's1', deviceId: 'dev1', kind: 'button_press', at: T0 + 10 * MINUTE, excluded: false }],
  });
  const ev = evaluateVisit(v, [], T0 + 15 * MINUTE);
  const facts = factsFor(v, ev);
  const audit = templateDisputeAudit(v, ev, facts, 'I arrived on time at 12:10', T0 + 20 * MINUTE);

  assert.equal(audit.verdict, 'Supported');
  assert.ok(audit.confidence >= 0.95);
  assert.ok(audit.evidenceReferences.some((r) => r.includes('Doorbell') || r.includes('doorbell')));
});

test('dispute arbiter gives Contradicted verdict when arrival is late', () => {
  const v = makeVisit({
    signals: [{ id: 's1', deviceId: 'dev1', kind: 'button_press', at: T0 + 80 * MINUTE, excluded: false }],
  });
  const ev = evaluateVisit(v, [], T0 + 90 * MINUTE);
  const facts = factsFor(v, ev);
  const audit = templateDisputeAudit(v, ev, facts, 'I arrived within window', T0 + 95 * MINUTE);

  assert.equal(audit.verdict, 'Contradicted');
  assert.ok(audit.analysis.includes('after'));
});
