import 'dotenv/config';
import { createApp } from './app.js';
import { createResearchAgent } from './services/researchAgent.js';
import { createTrendAgent } from './services/trendAgent.js';
import { createParallelSearchClient } from './services/parallelSearchClient.js';
import { createVideoBucketUploader } from './services/videoBucketUploader.js';
import { createFirestoreClient } from './services/firestoreClient.js';
import { createFirestoreFilmStore } from './services/filmStore.js';
import { createFirestoreDetailRowsStore } from './services/detailRowsStore.js';
import { createFirestoreDiscoveryJobStore } from './services/discoveryJobStore.js';
import { createFirestoreProjectStore } from './services/projectStore.js';
import { createFirestoreProjectRubricStore } from './services/projectRubricStore.js';
import { createFirestoreProjectItemStore } from './services/projectItemStore.js';
import { createFirestoreResearchRunStore } from './services/researchRunStore.js';
import { createFirestoreChatSessionStore } from './services/chatSessionStore.js';
import { createFirestoreDiscoveryChatSessionStore } from './services/discoveryChatSessionStore.js';
import { createResearchRunEventBus } from './services/researchRunEventBus.js';
import { createResearchChatAgent } from './services/researchChatAgent.js';
import { createDiscoveryChatAgent } from './services/discoveryChatAgent.js';
import { createDiscoveryAgent } from './services/discoveryAgent.js';
import { createMockDiscoveryAgent } from './services/mockDiscoveryAgent.js';
import { createDiscoveryEventBus } from './services/discoveryEventBus.js';
import { createDiscoveryQueueWorker } from './services/discoveryQueueWorker.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();

const firestore = createFirestoreClient(config);
const filmStore = createFirestoreFilmStore(firestore);
const detailRowsStore = createFirestoreDetailRowsStore(firestore);
const discoveryJobStore = createFirestoreDiscoveryJobStore(firestore);
const projectStore = createFirestoreProjectStore(firestore);
const projectRubricStore = createFirestoreProjectRubricStore(firestore);
const projectItemStore = createFirestoreProjectItemStore(firestore);
const researchRunStore = createFirestoreResearchRunStore(firestore);
const chatSessionStore = createFirestoreChatSessionStore(firestore);
const discoveryChatSessionStore = createFirestoreDiscoveryChatSessionStore(firestore);
const researchRunEventBus = createResearchRunEventBus();
const eventBus = createDiscoveryEventBus();

const researchAgent = createResearchAgent(config);
const parallelSearchClient = createParallelSearchClient({ apiKey: config.parallelApiKey });
const trendAgent = createTrendAgent(config, { parallelSearchClient });
const researchChatAgent = createResearchChatAgent(config, { projectItemStore, projectRubricStore, chatSessionStore });
const discoveryAgent = createDiscoveryAgent(config);
const mockDiscoveryAgent = createMockDiscoveryAgent({ mockDelayScale: config.mockDelayScale });
const discoveryChatAgent = createDiscoveryChatAgent(config, { detailRowsStore, discoveryJobStore, discoveryChatSessionStore, eventBus });

const videoBucketUploader = createVideoBucketUploader({
  bucketName: config.videoClipsBucket,
  maxUploadBytes: config.maxVideoUploadBytes,
});

const app = createApp({
  config,
  researchAgent,
  trendAgent,
  researchChatAgent,
  discoveryAgent,
  mockDiscoveryAgent,
  discoveryChatAgent,
  videoBucketUploader,
  filmStore,
  detailRowsStore,
  discoveryJobStore,
  projectStore,
  projectRubricStore,
  projectItemStore,
  researchRunStore,
  chatSessionStore,
  discoveryChatSessionStore,
  researchRunEventBus,
  eventBus,
});

// The discovery queue worker is a background polling loop with real side
// effects (Gemini calls, Firestore writes) — deliberately started only here,
// not inside createApp(), so tests stay side-effect-free. See
// discoveryQueueWorker.ts and docs/adr/0020.
const discoveryQueueWorker = createDiscoveryQueueWorker({
  discoveryJobStore,
  filmStore,
  detailRowsStore,
  discoveryAgent,
  mockDiscoveryAgent,
  eventBus,
});
discoveryQueueWorker.start();

app.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
