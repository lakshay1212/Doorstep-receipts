import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';

// Vercel Serverless environment setup
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataFile = isVercel ? '/tmp/doorstep_db.json' : (process.env.DATA_FILE || './data/db.json');

const config = loadConfig({
  ...process.env,
  DATA_FILE: dataFile,
  // Provide safe demo signing key fallback so missing env vars on Vercel never throw
  RING_WEBHOOK_SIGNING_KEY: process.env.RING_WEBHOOK_SIGNING_KEY || 'vercel-demo-signing-key',
  ENABLE_SIMULATOR: process.env.ENABLE_SIMULATOR || 'true',
});

// If running in serverless and /tmp data file doesn't exist, seed it with sample demo data
if (isVercel && !existsSync(dataFile)) {
  try {
    const seedPath = fileURLToPath(new URL('../data/seed.json', import.meta.url));
    if (existsSync(seedPath)) {
      mkdirSync(dirname(dataFile), { recursive: true });
      copyFileSync(seedPath, dataFile);
    }
  } catch (err) {
    console.warn('Could not copy seed data to /tmp:', err);
  }
}

const store = new Store(config.dataFile);
const app = createApp({ config, store });

// Guarantee root requests always serve the dashboard
app.get('/', (_req, res) => {
  res.redirect(302, '/index.html');
});

export default app;
