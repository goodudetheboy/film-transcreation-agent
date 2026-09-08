import 'dotenv/config';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createApp } from './app.js';
import type { VerifyIdToken } from './middleware/firebaseAuth.js';
import type { FirebaseUserAdmin } from './routes/admin.js';
import { createFirestoreAccountStore } from './services/accountStore.js';
import { createFirestoreApiCallLogStore } from './services/apiCallLogStore.js';
import { createFirestoreKillswitchStore } from './services/killswitchStore.js';
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
import { createVideoSegmentDescriber } from './services/videoSegmentDescriber.js';
import { createMockDiscoveryAgent } from './services/mockDiscoveryAgent.js';
import { createDiscoveryEventBus } from './services/discoveryEventBus.js';
import { createDiscoveryQueueWorker } from './services/discoveryQueueWorker.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();

// Same ADC as Firestore/Vertex (docs/adr/0003) — no service-account key file.
initializeApp({ credential: applicationDefault(), projectId: config.googleCloudProject });
const firebaseAuth = getAuth();

const verifyIdToken: VerifyIdToken = async (idToken) => {
  // checkRevoked:true — see middleware/firebaseAuth.ts's doc comment on why
  // (makes disabling an account take effect on its very next request).
  const decoded = await firebaseAuth.verifyIdToken(idToken, true);
  return { uid: decoded.uid, email: decoded.email ?? '', role: typeof decoded.role === 'string' ? decoded.role : undefined };
};

const firebaseUserAdmin: FirebaseUserAdmin = {
  async createUser({ email, password }) {
    const user = await firebaseAuth.createUser({ email, password });
    return { uid: user.uid };
  },
  async setCustomUserClaims(uid, claims) {
    await firebaseAuth.setCustomUserClaims(uid, claims);
  },
  async updateUser(uid, patch) {
    await firebaseAuth.updateUser(uid, patch);
    if (patch.disabled) await firebaseAuth.revokeRefreshTokens(uid);
  },
  async deleteUser(uid) {
    await firebaseAuth.deleteUser(uid);
  },
};

const firestore = createFirestoreClient(config);
const accountStore = createFirestoreAccountStore(firestore);
const apiCallLogStore = createFirestoreApiCallLogStore(firestore);
const killswitchStore = createFirestoreKillswitchStore(firestore);
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
const videoSegmentDescriber = createVideoSegmentDescriber(config);
const researchChatAgent = createResearchChatAgent(config, {
  projectItemStore,
  projectRubricStore,
  chatSessionStore,
  researchRunStore,
  filmStore,
  videoSegmentDescriber,
});
const discoveryAgent = createDiscoveryAgent(config);
const mockDiscoveryAgent = createMockDiscoveryAgent({ mockDelayScale: config.mockDelayScale });
const discoveryChatAgent = createDiscoveryChatAgent(config, {
  filmStore,
  detailRowsStore,
  discoveryJobStore,
  discoveryChatSessionStore,
  eventBus,
  videoSegmentDescriber,
});

const videoBucketUploader = createVideoBucketUploader({
  bucketName: config.videoClipsBucket,
  maxUploadBytes: config.maxVideoUploadBytes,
});

const app = createApp({
  config,
  accountStore,
  apiCallLogStore,
  killswitchStore,
  verifyIdToken,
  firebaseUserAdmin,
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
