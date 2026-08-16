import express, { type Express, Router } from 'express';
import cors from 'cors';
import { healthRoute } from './routes/health.js';
import { analyzeRoute } from './routes/analyze.js';
import { passcodeMiddleware } from './middleware/passcode.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { loadConfig, type Config } from './config/env.js';
import type { DialogflowClient } from './services/dialogflowClient.js';

export interface AppDeps {
  config?: Partial<Config>;
  dialogflowClient?: DialogflowClient;
}

const notConfiguredClient: DialogflowClient = {
  async analyzeScript() {
    throw new Error('dialogflowClient not provided to createApp()');
  },
};

export function createApp(deps: AppDeps = {}): Express {
  const config: Config = { ...loadConfig(), ...deps.config };
  const dialogflowClient = deps.dialogflowClient ?? notConfiguredClient;

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check stays unguarded — Cloud Run's probe shouldn't need a passcode.
  app.use(healthRoute());

  // Rate limit runs before the passcode check, so brute-force passcode guessing
  // still gets counted and blocked (see docs/adr/0005).
  const guarded = Router();
  guarded.use(rateLimitMiddleware({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }));
  guarded.use(passcodeMiddleware(config.sharedPasscode));
  guarded.use(
    analyzeRoute({
      dialogflowClient,
      maxScriptLines: config.maxScriptLines,
      revealDelayMs: config.revealDelayMs,
    }),
  );
  app.use(guarded);

  return app;
}
