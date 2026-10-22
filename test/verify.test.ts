import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signBody, verifySignature } from '../src/ring/verify.js';

const KEY = 'test-key';
const BODY = '{"meta":{"version":"1.1"},"data":{}}';

test('accepts a correct sha256= signature', () => {
  assert.equal(verifySignature(KEY, BODY, signBody(KEY, BODY)), true);
});

test('accepts the bare hex form too', () => {
  assert.equal(verifySignature(KEY, BODY, signBody(KEY, BODY).slice(7)), true);
});

test('rejects a tampered body, wrong key, and missing header', () => {
  const sig = signBody(KEY, BODY);
  assert.equal(verifySignature(KEY, BODY + ' ', sig), false);
  assert.equal(verifySignature('other-key', BODY, sig), false);
  assert.equal(verifySignature(KEY, BODY, undefined), false);
  assert.equal(verifySignature(KEY, BODY, 'sha256=deadbeef'), false);
});
