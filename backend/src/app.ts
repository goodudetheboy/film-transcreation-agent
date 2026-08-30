import express, { type Express, Router } from 'express';
import cors from 'cors';
import { healthRoute } from './routes/health.js';
import { verifyPasscodeRoute } from './routes/verifyPasscode.js';
import { projectsRoute } from './routes/projects.js';
import { filmsRoute } from './routes/films.js';
import { passcodeMiddleware } from './middleware/passcode.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { loadConfig, type Config } from './config/env.js';
import type { ResearchAgent } from './services/researchAgent.js';
import { createMockResearchAgent } from './services/mockResearchAgent.js';
import { createProjectStore, type ProjectStore } from './services/projectStore.js';
import { createInMemoryFilmStore, type FilmStore } from './services/filmStore.js';
import { createInMemoryDetailRowsStore, type DetailRowsStore } from './services/detailRowsStore.js';
import { createInMemoryDiscoveryJobStore, type DiscoveryJobStore } from './services/discoveryJobStore.js';
import type { DiscoveryAgent } from './services/discoveryAgent.js';
import { createMockDiscoveryAgent } from './services/mockDiscoveryAgent.js';
import { createDiscoveryEventBus, type DiscoveryEventBus } from './services/discoveryEventBus.js';
import { createFilmPrepPipeline, type FilmPrepPipeline } from './services/filmPrepPipeline.js';
import { DEFAULT_RUBRICS } from './config/defaultRubrics.js';
import type { VideoBucketUploader } from './services/videoBucketUploader.js';

export interface AppDeps {
  config?: Partial<Config>;
  researchAgent?: ResearchAgent;
  mockResearchAgent?: ResearchAgent;
  projectStore?: ProjectStore;
  filmStore?: FilmStore;
  detailRowsStore?: DetailRowsStore;
  discoveryJobStore?: DiscoveryJobStore;
  discoveryAgent?: DiscoveryAgent;
  mockDiscoveryAgent?: DiscoveryAgent;
  eventBus?: DiscoveryEventBus;
  videoBucketUploader?: VideoBucketUploader;
}

const notConfiguredResearchAgent: ResearchAgent = {
  async researchBatch() {
    throw new Error('researchAgent not provided to createApp()');
  },
};

const notConfiguredDiscoveryAgent: DiscoveryAgent = {
  async runPass() {
    throw new Error('discoveryAgent not provided to createApp()');
  },
};

const notConfiguredVideoBucketUploader: VideoBucketUploader = {
  async uploadFromUrl() {
    throw new Error('videoBucketUploader not provided to createApp()');
  },
  async uploadBuffer() {
    throw new Error('videoBucketUploader not provided to createApp()');
  },
  async createResumableUploadSession() {
    throw new Error('videoBucketUploader not provided to createApp()');
  },
};

/**
 * `createApp` never starts the discovery queue worker itself (see
 * discoveryQueueWorker.ts) — that's a background polling loop with real side
 * effects, started explicitly by server.ts, matching this app's existing
 * convention that createApp() stays side-effect-free for tests.
 */
export function createApp(deps: AppDeps = {}): Express {
  const config: Config = { ...loadConfig(), ...deps.config };
  const researchAgent = deps.researchAgent ?? notConfiguredResearchAgent;
  const mockResearchAgent = deps.mockResearchAgent ?? createMockResearchAgent();
  const projectStore = deps.projectStore ?? createProjectStore();
  const filmStore = deps.filmStore ?? createInMemoryFilmStore();
  const detailRowsStore = deps.detailRowsStore ?? createInMemoryDetailRowsStore();
  const discoveryJobStore = deps.discoveryJobStore ?? createInMemoryDiscoveryJobStore();
  const discoveryAgent = deps.discoveryAgent ?? notConfiguredDiscoveryAgent;
  const mockDiscoveryAgent = deps.mockDiscoveryAgent ?? createMockDiscoveryAgent({ mockDelayScale: config.mockDelayScale });
  const eventBus = deps.eventBus ?? createDiscoveryEventBus();
  const videoBucketUploader = deps.videoBucketUploader ?? notConfiguredVideoBucketUploader;

  const filmPrepPipeline: FilmPrepPipeline = createFilmPrepPipeline({
    filmStore,
    detailRowsStore,
    discoveryAgent,
    mockDiscoveryAgent,
    eventBus,
    mockDelayScale: config.mockDelayScale,
  });

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
    projectsRoute({
      store: projectStore,
      researchAgent,
      mockResearchAgent,
      defaultRubrics: DEFAULT_RUBRICS,
    }),
  );
  // Serves mock-mode uploaded video bytes back over HTTP. Sits behind the same
  // passcode gate as everything else in `guarded` (passcodeMiddleware runs first).
  guarded.use('/mock-uploads', express.static(config.mockUploadsDir));
  guarded.use(
    filmsRoute({
      filmStore,
      detailRowsStore,
      discoveryJobStore,
      projectStore,
      defaultRubrics: DEFAULT_RUBRICS,
      videoBucketUploader,
      maxVideoUploadBytes: config.maxVideoUploadBytes,
      maxSubtitleUploadBytes: config.maxSubtitleUploadBytes,
      subtitleUploadPrefix: config.subtitleUploadPrefix,
      eventBus,
      filmPrepPipeline,
      mockDelayScale: config.mockDelayScale,
      mockUploadsDir: config.mockUploadsDir,
    }),
  );
  app.use(guarded);

  return app;
}
