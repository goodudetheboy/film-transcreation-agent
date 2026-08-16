export interface Config {
  port: number;
  sharedPasscode: string;
  maxScriptLines: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  revealDelayMs: number;
  googleCloudProject: string;
  dialogflowLocation: string;
  dialogflowAgentId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    sharedPasscode: env.SHARED_PASSCODE ?? 'dev-passcode',
    maxScriptLines: Number(env.MAX_SCRIPT_LINES ?? 200),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 20),
    revealDelayMs: Number(env.REVEAL_DELAY_MS ?? 150),
    googleCloudProject: env.GOOGLE_CLOUD_PROJECT ?? 'silent-scholar-505618-u6',
    dialogflowLocation: env.DIALOGFLOW_LOCATION ?? 'us-central1',
    dialogflowAgentId: env.DIALOGFLOW_AGENT_ID ?? 'f475df77-4a24-4d7e-a6ff-a3f5d039f975',
  };
}
