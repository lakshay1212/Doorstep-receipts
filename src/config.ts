export interface Config {
  port: number;
  dataFile: string;
  signingKey: string;
  demoAccountId: string;
  simulatorEnabled: boolean;
  publicBaseUrl: string | null;
  bedrockModelId: string | null;
  awsRegion: string;
  ringAccessToken: string | null;
  dashboardKey: string | null;
  isProd: boolean;
  maxVisits: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProd = env.NODE_ENV === 'production';
  const signingKey = env.RING_WEBHOOK_SIGNING_KEY || (isProd ? '' : 'dev-signing-key');
  if (!signingKey) {
    throw new Error('RING_WEBHOOK_SIGNING_KEY is required when NODE_ENV=production');
  }
  const simFlag = env.ENABLE_SIMULATOR;
  return {
    port: Number(env.PORT || 3000),
    dataFile: env.DATA_FILE || './data/db.json',
    signingKey,
    demoAccountId: env.DEMO_ACCOUNT_ID || 'ava1.ring.account.DEMO',
    simulatorEnabled: simFlag ? simFlag === 'true' : !isProd,
    publicBaseUrl: env.PUBLIC_BASE_URL ? env.PUBLIC_BASE_URL.replace(/\/$/, '') : null,
    bedrockModelId: env.BEDROCK_MODEL_ID || null,
    awsRegion: env.AWS_REGION || 'us-east-1',
    ringAccessToken: env.RING_ACCESS_TOKEN || null,
    dashboardKey: env.DASHBOARD_API_KEY || null,
    isProd,
    maxVisits: Number(env.MAX_VISITS || 200),
  };
}
