import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { Store } from './store.js';

const config = loadConfig();
const store = new Store(config.dataFile);
const app = createApp({ config, store });

app.listen(config.port, () => {
  console.log(`Doorstep Receipts on http://localhost:${config.port}`);
  console.log(`  Ring webhook:   POST /webhooks/ring  (HMAC-SHA256 in X-Signature)`);
  console.log(`  Simulator:      ${config.simulatorEnabled ? 'on' : 'off'}`);
  console.log(`  Visit summary:  ${config.bedrockModelId ? `Bedrock (${config.bedrockModelId})` : 'template (set BEDROCK_MODEL_ID to use Bedrock)'}`);
});
