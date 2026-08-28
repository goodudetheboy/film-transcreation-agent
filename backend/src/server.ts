import 'dotenv/config';
import { createApp } from './app.js';
import { createResearchAgent } from './services/researchAgent.js';
import { createVideoBucketUploader } from './services/videoBucketUploader.js';
import { createFirestoreClient } from './services/firestoreClient.js';
import { createFirestoreFilmStore } from './services/filmStore.js';
import { createFirestoreDetailRowsStore } from './services/detailRowsStore.js';
import { createFirestoreDiscoveryJobStore } from './services/discoveryJobStore.js';
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

const researchAgent = createResearchAgent(config);
const discoveryAgent = createDiscoveryAgent(config);
const mockDiscoveryAgent = createMockDiscoveryAgent({ mockDelayScale: config.mockDelayScale });
const eventBus = createDiscoveryEventBus();

const videoBucketUploader = createVideoBucketUploader({
  bucketName: config.videoClipsBucket,
  maxUploadBytes: config.maxVideoUploadBytes,
});

const app = createApp({
  config,
  researchAgent,
  discoveryAgent,
  mockDiscoveryAgent,
  videoBucketUploader,
  filmStore,
  detailRowsStore,
  discoveryJobStore,
  eventBus,
});

// The discovery queue worker is a background polling loop with real side
// effects (Gemini calls, Firestore writes) — deliberately started only here,
// not inside createApp(), so tests stay side-effect-free. See
// discoveryQueueWorker.ts and docs/adr/0020.
const discoveryQueueWorker = createDiscoveryQueueWorker({
  discoveryJobStore,
  filmStore,
  discoveryAgent,
  mockDiscoveryAgent,
  eventBus,
});
discoveryQueueWorker.start();

app.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
