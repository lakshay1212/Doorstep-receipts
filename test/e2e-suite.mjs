import { createHmac } from 'node:crypto';

const TARGET = process.argv[2] || 'http://localhost:3000';
console.log(`\n=======================================================`);
console.log(`🚀 COMPREHENSIVE E2E & LIMITS TEST SUITE`);
console.log(`Target: ${TARGET}`);
console.log(`=======================================================\n`);

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    process.stdout.write(`• Testing: ${name}... `);
    await fn();
    console.log(`✅ PASS`);
    passed++;
  } catch (err) {
    console.log(`❌ FAIL`);
    console.error(`  Error: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// 1. Health check
await check('1. GET /healthz answers 200 OK without auth', async () => {
  const res = await fetch(`${TARGET}/healthz`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.ok === true, 'Expected { ok: true }');
});

// 2. Dashboard static page loading
await check('2. GET /index.html serves full UI and meta tags', async () => {
  const res = await fetch(`${TARGET}/index.html`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const text = await res.text();
  assert(text.includes('Doorstep Receipts'), 'Dashboard title missing');
  assert(text.includes('judge-banner'), 'Judge banner missing');
  assert(text.includes('/app.css'), 'Stylesheet link missing');
  assert(text.includes('/app.js'), 'Script link missing');
});

// 3. Static assets availability
await check('3. Static CSS & JS return 200 and correct content types', async () => {
  const css = await fetch(`${TARGET}/app.css`);
  assert(css.status === 200, `CSS failed: ${css.status}`);
  assert((css.headers.get('content-type') || '').includes('text/css'), 'CSS content-type wrong');

  const js = await fetch(`${TARGET}/app.js`);
  assert(js.status === 200, `JS failed: ${js.status}`);
  assert((js.headers.get('content-type') || '').includes('javascript'), 'JS content-type wrong');
});

// 4. List visits
let visits = [];
await check('4. GET /api/visits returns populated seed visits', async () => {
  const res = await fetch(`${TARGET}/api/visits`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  visits = await res.json();
  assert(Array.isArray(visits), 'Visits should be an array');
  assert(visits.length > 0, 'Expected seeded visits to be present');
});

// 5. Create valid visit
let createdVisit = null;
const now = Date.now();
const windowStart = now - 30 * 60 * 1000;
const windowEnd = now + 60 * 60 * 1000;
const uniqueDevice = `device_${Date.now()}`;

await check('5. POST /api/visits creates a valid scheduled visit', async () => {
  const res = await fetch(`${TARGET}/api/visits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Solar Panel Inverter Check',
      contractor: 'GreenVolt Clean Energy',
      deviceId: uniqueDevice,
      windowStart,
      windowEnd,
      earlyGraceMin: 15,
      lateGraceMin: 60,
      timeZone: 'UTC',
    }),
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);
  createdVisit = await res.json();
  assert(createdVisit.id, 'Created visit missing ID');
  assert(createdVisit.title === 'Solar Panel Inverter Check', 'Title mismatch');
  assert(createdVisit.phase === 'watching', `Expected phase watching, got ${createdVisit.phase}`);
});

// 6. Limits: Window > 12 hours rejected
await check('6. LIMIT: Window longer than 12 hours rejected with 400', async () => {
  const res = await fetch(`${TARGET}/api/visits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Invalid Long Job',
      contractor: 'Too Long Co',
      deviceId: uniqueDevice,
      windowStart: now,
      windowEnd: now + 13 * 60 * 60 * 1000,
      timeZone: 'UTC',
    }),
  });
  assert(res.status === 400, `Expected 400 for >12h window, got ${res.status}`);
  const data = await res.json();
  assert(data.message.includes('12 hours'), `Expected error message about 12 hours: ${data.message}`);
});

// 7. Limits: Window End before Window Start rejected
await check('7. LIMIT: Window End before Window Start rejected with 400', async () => {
  const res = await fetch(`${TARGET}/api/visits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Time Travel Job',
      contractor: 'Doctor Who',
      deviceId: uniqueDevice,
      windowStart: now + 10000,
      windowEnd: now - 10000,
      timeZone: 'UTC',
    }),
  });
  assert(res.status === 400, `Expected 400 for negative window, got ${res.status}`);
});

// 8. Ring Webhook HMAC validation
await check('8. SECURITY: Rejects unsigned / wrongly-signed Ring webhooks (401)', async () => {
  const res = await fetch(`${TARGET}/webhooks/ring`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    },
    body: JSON.stringify({
      meta: { request_id: 'r_bad', account_id: 'a1', time: new Date().toISOString() },
      data: { id: 'e_bad', type: 'button_press', attributes: { source: uniqueDevice, timestamp: now } },
    }),
  });
  assert(res.status === 401, `Expected 401 Unauthorized for bad HMAC signature, got ${res.status}`);
});

// Helper for Ring Webhooks
async function postRingWebhook(target, key, deviceId, eventType, timestamp, subType) {
  const payload = JSON.stringify({
    meta: {
      version: '1.1',
      time: new Date().toISOString(),
      request_id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      account_id: 'ava1.ring.account.DEMO',
    },
    data: {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: eventType,
      subType: subType || undefined,
      attributes: {
        source: deviceId,
        timestamp,
      },
    },
  });

  const sig = createHmac('sha256', key).update(payload).digest('hex');
  const res = await fetch(`${target}/webhooks/ring`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': `sha256=${sig}`,
    },
    body: payload,
  });
  return { res, payload };
}

// 9. Deliver legitimate Ring Webhook using active signing key
const keysToTry = ['dev-signing-key', 'vercel-demo-signing-key'];
let workingKey = null;

await check('9. INGEST: Official Ring Partner v1.1 webhook processed and matched to visit (200 OK)', async () => {
  for (const k of keysToTry) {
    const { res } = await postRingWebhook(TARGET, k, uniqueDevice, 'button_press', windowStart + 5 * 60 * 1000);
    if (res.status === 200) {
      workingKey = k;
      break;
    }
  }
  assert(workingKey, 'Could not authenticate webhook with known signing keys');
});

// 10. Privacy Gate: Replay attack & deduplication
await check('10. PRIVACY GATE: Replay of duplicate requestId is deduplicated without double count', async () => {
  assert(workingKey, 'Missing workingKey');
  const payload = JSON.stringify({
    meta: {
      version: '1.1',
      time: new Date().toISOString(),
      request_id: `req_dedup_${Date.now()}`,
      account_id: 'ava1.ring.account.DEMO',
    },
    data: {
      id: `evt_dedup_${Date.now()}`,
      type: 'button_press',
      attributes: {
        source: uniqueDevice,
        timestamp: windowStart + 6 * 60 * 1000,
      },
    },
  });

  const sig = createHmac('sha256', workingKey).update(payload).digest('hex');
  const first = await fetch(`${TARGET}/webhooks/ring`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': `sha256=${sig}` },
    body: payload,
  });
  assert(first.status === 200, `First deliver failed: ${first.status}`);

  // Replay exact request
  const replay = await fetch(`${TARGET}/webhooks/ring`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': `sha256=${sig}` },
    body: payload,
  });
  assert(replay.status === 200, `Replay deliver failed: ${replay.status}`);
  const replayBody = await replay.json();
  assert(replayBody.status === 'duplicate', `Expected status duplicate, got ${JSON.stringify(replayBody)}`);
});

// 11. Privacy Gate: Outside window motion discarded
await check('11. PRIVACY GATE: Motion outside booked window is discarded without persisting', async () => {
  assert(workingKey, 'Missing workingKey');
  // Timestamp is 10 hours before windowStart (far outside watch period for this unique device)
  const outsideTs = windowStart - 10 * 60 * 60 * 1000;
  const { res } = await postRingWebhook(TARGET, workingKey, uniqueDevice, 'motion_detected', outsideTs, 'human');
  assert(res.status === 200, `Delivery failed: ${res.status}`);
  const body = await res.json();
  assert(body.kept === false, `Expected kept: false for outside signal, got ${JSON.stringify(body)}`);
});

// 12. Smart Lock Access State
await check('12. ACCESS CONTROL: Smart lock PIN unlocks and generates ephemeral PIN on arrival', async () => {
  assert(createdVisit, 'No visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}`);
  assert(res.status === 200, `Fetch failed: ${res.status}`);
  const updated = await res.json();
  assert(updated.smartLock, 'Missing smartLock data');
  assert(updated.smartLock.state === 'active' || updated.smartLock.state === 'issued', `Unexpected lock state: ${updated.smartLock.state}`);
  assert(updated.smartLock.pin, 'PIN was not generated');
});

// 13. Smart Lock Manual Revoke/Restore Toggle
await check('13. ACCESS CONTROL: Toggle Smart Lock keypad access PIN', async () => {
  assert(createdVisit, 'No visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/smart-lock/toggle`, {
    method: 'POST',
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.smartLock, 'Missing smartLock after toggle');
  assert(data.smartLock.state === 'revoked', `Expected revoked, got ${data.smartLock.state}`);
});

// 14. Public Share Link & QR Generation
let shareUrl = null;
let shareToken = null;
await check('14. SHARE: Generate public receipt link with expiration & URL (201 Created)', async () => {
  assert(createdVisit, 'No created visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ days: 7 }),
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.share && data.share.url, 'Missing share url');
  shareUrl = data.share.url;
  shareToken = shareUrl.split('/r/')[1];
  assert(shareToken, 'Could not extract token from share URL');
});

// 15. Public receipt viewer HTML & QR Code check
await check('15. RECEIPT VIEWER: Public /r/:token renders cryptographic proof & SVG QR code', async () => {
  assert(shareToken, 'No share token');
  const res = await fetch(`${TARGET}/r/${shareToken}`);
  assert(res.status === 200, `Expected 200 for public receipt, got ${res.status}`);
  assert((res.headers.get('content-type') || '').includes('html'), 'Expected HTML response');
  const html = await res.text();
  assert(html.includes('Doorstep Receipt'), 'Receipt header missing');
  assert(html.includes('GreenVolt Clean Energy'), 'Contractor name missing from receipt');
  assert(html.includes('<svg'), 'SVG QR code missing from rendered receipt');
});

// 16. Bedrock AI Dispute Arbiter
await check('16. ARBITER: Amazon Bedrock dispute audit evaluates claim against ground-truth facts', async () => {
  assert(createdVisit, 'No created visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/dispute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      claim: 'I arrived on time within the agreed window and performed the solar inspection.',
    }),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.dispute, 'Missing dispute audit');
  assert(['Supported', 'Contradicted', 'Inconclusive'].includes(data.dispute.verdict), `Invalid verdict: ${data.dispute.verdict}`);
  assert(data.dispute.confidence >= 0.5, 'Confidence score too low');
  assert(Array.isArray(data.dispute.evidenceReferences), 'evidenceReferences should be an array');
  assert(Array.isArray(data.dispute.limitations), 'limitations should be an array');
});

// 17. Cryptographic Evidence Verification Seal (GET /api/visits/:id/verify-integrity)
await check('17. VERIFICATION: Verify evidence integrity seal (HMAC canonical manifest)', async () => {
  assert(createdVisit, 'No created visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/verify-integrity`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.verified === true, 'Evidence seal verification failed');
  assert(data.canonicalManifest, 'Missing canonical manifest');
  assert(data.computedDigest, 'Missing computedDigest');
});

// 18. Tamper Detection Test
await check('18. TAMPER DETECTION: Altering expected digest causes verification to fail', async () => {
  assert(createdVisit, 'No created visit');
  const tamperedDigest = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/verify-integrity?expected=${tamperedDigest}`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.verified === false, 'Expected tamper detection to report verified: false');
  assert(data.failureReason && data.failureReason.includes('mismatch'), `Expected mismatch in failureReason, got ${data.failureReason}`);
});

// 19. B2B Webhook Dispatch (Stripe & Jobber payload generation)
await check('19. B2B DISPATCH: Generate structured billing event for Stripe / Jobber', async () => {
  assert(createdVisit, 'No created visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/business-dispatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: 'Jobber',
    }),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.event, 'Missing business event object');
  assert(data.event.platform === 'Jobber', 'Target platform mismatch');
  assert(data.event.payload.data.receipt_id, 'Missing receipt_id in B2B payload');
});

// 20. Confirm Departure
await check('20. DEPARTURE: Homeowner departure confirmation records departure timestamp', async () => {
  assert(createdVisit, 'No created visit');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}/confirm-departure`, {
    method: 'POST',
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.departureLabel || data.timeOnSiteLabel, 'Expected departure timestamp/label');
});

// 21. Revoke Share Link (DELETE /api/visits/:id/share)
await check('21. REVOKE: Revoking share link immediately turns /r/:token into 410 Gone', async () => {
  assert(createdVisit && shareToken, 'No share token to revoke');
  const revokeRes = await fetch(`${TARGET}/api/visits/${createdVisit.id}/share`, {
    method: 'DELETE',
  });
  assert(revokeRes.status === 200, `Expected 200, got ${revokeRes.status}`);

  const getRes = await fetch(`${TARGET}/r/${shareToken}`);
  assert(getRes.status === 410, `Expected 410 Gone for revoked receipt, got ${getRes.status}`);
});

// 22. Clean up test visit (DELETE /api/visits/:id)
await check('22. CLEANUP: DELETE /api/visits/:id deletes visit and cascades', async () => {
  assert(createdVisit, 'No visit to delete');
  const res = await fetch(`${TARGET}/api/visits/${createdVisit.id}`, {
    method: 'DELETE',
  });
  assert(res.status === 204, `Expected 204 No Content, got ${res.status}`);
});

console.log(`\n=======================================================`);
console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`=======================================================\n`);

if (failed > 0) process.exit(1);
