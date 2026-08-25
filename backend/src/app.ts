import express, { type Express, Router } from 'express';
import cors from 'cors';
import { healthRoute } from './routes/health.js';
import { analyzeRoute } from './routes/analyze.js';
import { verifyPasscodeRoute } from './routes/verifyPasscode.js';
import { projectsRoute } from './routes/projects.js';
import { filmsRoute } from './routes/films.js';
import { passcodeMiddleware } from './middleware/passcode.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { loadConfig, type Config } from './config/env.js';
import type { DialogflowClient } from './services/dialogflowClient.js';
import { createMockDialogflowClient } from './services/mockDialogflowClient.js';
import type { ResearchAgent } from './services/researchAgent.js';
import { createMockResearchAgent } from './services/mockResearchAgent.js';
import { createProjectStore, type ProjectStore } from './services/projectStore.js';
import { createFilmStore, type FilmStore } from './services/filmStore.js';
import { DEFAULT_RUBRICS } from './config/defaultRubrics.js';
import { INSIDE_OUT_DETAILS } from './fixtures/insideOutDetails.js';

export interface AppDeps {
  config?: Partial<Config>;
  dialogflowClient?: DialogflowClient;
  mockDialogflowClient?: DialogflowClient;
  researchAgent?: ResearchAgent;
  mockResearchAgent?: ResearchAgent;
  projectStore?: ProjectStore;
  filmStore?: FilmStore;
}

const notConfiguredClient: DialogflowClient = {
  async analyzeScript() {
    throw new Error('dialogflowClient not provided to createApp()');
  },
};

const notConfiguredResearchAgent: ResearchAgent = {
  async researchBatch() {
    throw new Error('researchAgent not provided to createApp()');
  },
};

export function createApp(deps: AppDeps = {}): Express {
  const config: Config = { ...loadConfig(), ...deps.config };
  const dialogflowClient = deps.dialogflowClient ?? notConfiguredClient;
  const mockDialogflowClient = deps.mockDialogflowClient ?? createMockDialogflowClient();
  const researchAgent = deps.researchAgent ?? notConfiguredResearchAgent;
  const mockResearchAgent = deps.mockResearchAgent ?? createMockResearchAgent();
  const projectStore = deps.projectStore ?? createProjectStore();
  const filmStore =
    deps.filmStore ??
    createFilmStore(INSIDE_OUT_DETAILS, [
      {
        title: 'Inside Out',
        script: '(sample script placeholder — mock data, not the real screenplay)',
        videoUrl: 'https://example.com/videos/inside-out-mock.mp4',
      },
    ]);

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
  guarded.use(verifyPasscodeRoute());
  guarded.use(
    analyzeRoute({
      dialogflowClient,
      mockDialogflowClient,
      maxScriptLines: config.maxScriptLines,
      revealDelayMs: config.revealDelayMs,
    }),
  );
  guarded.use(
    projectsRoute({
      store: projectStore,
      researchAgent,
      mockResearchAgent,
      defaultRubrics: DEFAULT_RUBRICS,
    }),
  );
  guarded.use(
    filmsRoute({
      filmStore,
      projectStore,
      defaultRubrics: DEFAULT_RUBRICS,
    }),
  );
  app.use(guarded);

  return app;
}
