import express, { type Express, Router } from 'express';
import cors from 'cors';
import { healthRoute } from './routes/health.js';
import { configRoute } from './routes/config.js';
import { projectsRoute } from './routes/projects.js';
import { projectChatRoute } from './routes/projectChat.js';
import { discoveryChatRoute } from './routes/discoveryChat.js';
import { filmsRoute } from './routes/films.js';
import { adminRoute, type FirebaseUserAdmin } from './routes/admin.js';
import { firebaseAuthMiddleware, type VerifyIdToken } from './middleware/firebaseAuth.js';
import { killswitchMiddleware } from './middleware/killswitch.js';
import { callLoggingMiddleware } from './middleware/callLogging.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { loadConfig, type Config } from './config/env.js';
import { createInMemoryAccountStore, type AccountStore } from './services/accountStore.js';
import { createInMemoryApiCallLogStore, type ApiCallLogStore } from './services/apiCallLogStore.js';
import { createInMemoryKillswitchStore, type KillswitchStore } from './services/killswitchStore.js';
import type { ResearchAgent } from './services/researchAgent.js';
import { createMockResearchAgent } from './services/mockResearchAgent.js';
import type { TrendAgent } from './services/trendAgent.js';
import { createMockTrendAgent } from './services/mockTrendAgent.js';
import { createInMemoryProjectStore, type ProjectStore } from './services/projectStore.js';
import { createInMemoryProjectRubricStore, type ProjectRubricStore } from './services/projectRubricStore.js';
import { createInMemoryProjectItemStore, type ProjectItemStore } from './services/projectItemStore.js';
import { createInMemoryResearchRunStore, type ResearchRunStore } from './services/researchRunStore.js';
import { createInMemoryChatSessionStore, type ChatSessionStore } from './services/chatSessionStore.js';
import { createResearchRunEventBus, type ResearchRunEventBus } from './services/researchRunEventBus.js';
import { createInMemoryFilmStore, type FilmStore } from './services/filmStore.js';
import { createInMemoryDetailRowsStore, type DetailRowsStore } from './services/detailRowsStore.js';
import { createInMemoryDiscoveryJobStore, type DiscoveryJobStore } from './services/discoveryJobStore.js';
import type { DiscoveryAgent } from './services/discoveryAgent.js';
import { createMockDiscoveryAgent } from './services/mockDiscoveryAgent.js';
import { createDiscoveryEventBus, type DiscoveryEventBus } from './services/discoveryEventBus.js';
import { createFilmPrepPipeline, type FilmPrepPipeline } from './services/filmPrepPipeline.js';
import { DEFAULT_RUBRICS } from './config/defaultRubrics.js';
import type { VideoBucketUploader } from './services/videoBucketUploader.js';
import type { ResearchChatAgent } from './services/researchChatAgent.js';
import { createMockResearchChatAgent } from './services/mockResearchChatAgent.js';
import { createInMemoryDiscoveryChatSessionStore, type DiscoveryChatSessionStore } from './services/discoveryChatSessionStore.js';
import type { DiscoveryChatAgent } from './services/discoveryChatAgent.js';
import { createMockDiscoveryChatAgent } from './services/mockDiscoveryChatAgent.js';
import type { VideoSegmentDescriber } from './services/videoSegmentDescriber.js';

export interface AppDeps {
  config?: Partial<Config>;
  researchAgent?: ResearchAgent;
  mockResearchAgent?: ResearchAgent;
  trendAgent?: TrendAgent;
  mockTrendAgent?: TrendAgent;
  researchChatAgent?: ResearchChatAgent;
  mockResearchChatAgent?: ResearchChatAgent;
  projectStore?: ProjectStore;
  projectRubricStore?: ProjectRubricStore;
  projectItemStore?: ProjectItemStore;
  researchRunStore?: ResearchRunStore;
  chatSessionStore?: ChatSessionStore;
  researchRunEventBus?: ResearchRunEventBus;
  filmStore?: FilmStore;
  detailRowsStore?: DetailRowsStore;
  discoveryJobStore?: DiscoveryJobStore;
  discoveryAgent?: DiscoveryAgent;
  mockDiscoveryAgent?: DiscoveryAgent;
  discoveryChatSessionStore?: DiscoveryChatSessionStore;
  discoveryChatAgent?: DiscoveryChatAgent;
  mockDiscoveryChatAgent?: DiscoveryChatAgent;
  eventBus?: DiscoveryEventBus;
  videoBucketUploader?: VideoBucketUploader;
  videoSegmentDescriber?: VideoSegmentDescriber;
  accountStore?: AccountStore;
  apiCallLogStore?: ApiCallLogStore;
  killswitchStore?: KillswitchStore;
  /** Verifies a Firebase ID token — defaults to rejecting everything, since a
   * real verifier needs a real Firebase project (server.ts provides it via
   * firebase-admin). Tests inject a fake, same convention as researchAgent
   * defaulting to notConfiguredResearchAgent below. */
  verifyIdToken?: VerifyIdToken;
  firebaseUserAdmin?: FirebaseUserAdmin;
}

const notConfiguredResearchAgent: ResearchAgent = {
  async researchBatch() {
    throw new Error('researchAgent not provided to createApp()');
  },
};

const notConfiguredTrendAgent: TrendAgent = {
  async findTrendSuggestions() {
    throw new Error('trendAgent not provided to createApp()');
  },
};

const notConfiguredResearchChatAgent: ResearchChatAgent = {
  // eslint-disable-next-line require-yield
  async *runTurn() {
    throw new Error('researchChatAgent not provided to createApp()');
  },
};

const notConfiguredDiscoveryAgent: DiscoveryAgent = {
  async runPass() {
    throw new Error('discoveryAgent not provided to createApp()');
  },
};

const notConfiguredDiscoveryChatAgent: DiscoveryChatAgent = {
  // eslint-disable-next-line require-yield
  async *runTurn() {
    throw new Error('discoveryChatAgent not provided to createApp()');
  },
};

const notConfiguredVideoSegmentDescriber: VideoSegmentDescriber = {
  async describeVideoSegment() {
    throw new Error('videoSegmentDescriber not provided to createApp()');
  },
};

const notConfiguredVerifyIdToken: VerifyIdToken = async () => {
  throw new Error('verifyIdToken not provided to createApp()');
};

const notConfiguredFirebaseUserAdmin: FirebaseUserAdmin = {
  async createUser() {
    throw new Error('firebaseUserAdmin not provided to createApp()');
  },
  async setCustomUserClaims() {
    throw new Error('firebaseUserAdmin not provided to createApp()');
  },
  async updateUser() {
    throw new Error('firebaseUserAdmin not provided to createApp()');
  },
  async deleteUser() {
    throw new Error('firebaseUserAdmin not provided to createApp()');
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
  async getObjectSizeBytes() {
    throw new Error('videoBucketUploader not provided to createApp()');
  },
  async deleteObject() {
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
  const trendAgent = deps.trendAgent ?? notConfiguredTrendAgent;
  const mockTrendAgent = deps.mockTrendAgent ?? createMockTrendAgent();
  const projectStore = deps.projectStore ?? createInMemoryProjectStore();
  const projectRubricStore = deps.projectRubricStore ?? createInMemoryProjectRubricStore();
  const projectItemStore = deps.projectItemStore ?? createInMemoryProjectItemStore();
  const researchRunStore = deps.researchRunStore ?? createInMemoryResearchRunStore();
  const chatSessionStore = deps.chatSessionStore ?? createInMemoryChatSessionStore();
  const researchRunEventBus = deps.researchRunEventBus ?? createResearchRunEventBus();
  const researchChatAgent = deps.researchChatAgent ?? notConfiguredResearchChatAgent;
  const filmStore = deps.filmStore ?? createInMemoryFilmStore();
  const videoSegmentDescriber = deps.videoSegmentDescriber ?? notConfiguredVideoSegmentDescriber;
  const mockResearchChatAgent =
    deps.mockResearchChatAgent ??
    createMockResearchChatAgent({ projectItemStore, projectRubricStore, chatSessionStore, filmStore, videoSegmentDescriber });
  const detailRowsStore = deps.detailRowsStore ?? createInMemoryDetailRowsStore();
  const discoveryJobStore = deps.discoveryJobStore ?? createInMemoryDiscoveryJobStore();
  const discoveryAgent = deps.discoveryAgent ?? notConfiguredDiscoveryAgent;
  const mockDiscoveryAgent = deps.mockDiscoveryAgent ?? createMockDiscoveryAgent({ mockDelayScale: config.mockDelayScale });
  const eventBus = deps.eventBus ?? createDiscoveryEventBus();
  const discoveryChatSessionStore = deps.discoveryChatSessionStore ?? createInMemoryDiscoveryChatSessionStore();
  const discoveryChatAgent = deps.discoveryChatAgent ?? notConfiguredDiscoveryChatAgent;
  const mockDiscoveryChatAgent =
    deps.mockDiscoveryChatAgent ??
    createMockDiscoveryChatAgent({ filmStore, detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus, videoSegmentDescriber });
  const videoBucketUploader = deps.videoBucketUploader ?? notConfiguredVideoBucketUploader;
  const accountStore = deps.accountStore ?? createInMemoryAccountStore();
  const apiCallLogStore = deps.apiCallLogStore ?? createInMemoryApiCallLogStore();
  const killswitchStore = deps.killswitchStore ?? createInMemoryKillswitchStore();
  const verifyIdToken = deps.verifyIdToken ?? notConfiguredVerifyIdToken;
  const firebaseUserAdmin = deps.firebaseUserAdmin ?? notConfiguredFirebaseUserAdmin;

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

  // Health check stays unguarded — Cloud Run's probe shouldn't need auth.
  app.use(healthRoute());

  // A <video> tag's GET can't carry an Authorization header — mock-uploaded
  // clips (test mode only, never real film data) stay unauthenticated for the
  // same reason they used to ride a passcode query param instead of the real
  // gate. Mounted before firebaseAuth, same tier as the health check.
  app.use('/mock-uploads', express.static(config.mockUploadsDir));

  // Rate limit runs before auth, so a flood of bad tokens still gets counted
  // and blocked (see docs/adr/0005).
  const guarded = Router();
  guarded.use(rateLimitMiddleware({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }));
  guarded.use(firebaseAuthMiddleware({ verifyIdToken, accountStore }));
  guarded.use(killswitchMiddleware(killswitchStore));
  guarded.use(callLoggingMiddleware(apiCallLogStore));
  guarded.use(configRoute({ defaultRubrics: DEFAULT_RUBRICS }));
  guarded.use(
    '/api/admin',
    adminRoute({
      accountStore,
      apiCallLogStore,
      killswitchStore,
      firebaseUserAdmin,
    }),
  );
  guarded.use(
    projectsRoute({
      projectStore,
      projectRubricStore,
      projectItemStore,
      detailRowsStore,
      researchRunStore,
      researchAgent,
      mockResearchAgent,
      trendAgent,
      mockTrendAgent,
      eventBus: researchRunEventBus,
      filmStore,
      discoveryJobStore,
    }),
  );
  guarded.use(
    projectChatRoute({
      projectStore,
      chatSessionStore,
      researchRunStore,
      researchChatAgent,
      mockResearchChatAgent,
    }),
  );
  guarded.use(
    discoveryChatRoute({
      filmStore,
      discoveryJobStore,
      discoveryChatSessionStore,
      discoveryChatAgent,
      mockDiscoveryChatAgent,
    }),
  );
  guarded.use(
    filmsRoute({
      filmStore,
      detailRowsStore,
      discoveryJobStore,
      projectStore,
      projectRubricStore,
      projectItemStore,
      researchRunStore,
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
