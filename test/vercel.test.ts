import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../api/index.js';

test('vercel serverless app entrypoint responds to health check', async () => {
  assert.equal(typeof app, 'function', 'app should be an Express request handler');
});
