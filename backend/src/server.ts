import 'dotenv/config';
import { createApp } from './app.js';
import { createResearchAgent } from './services/researchAgent.js';
import { createCaptioningClient } from './services/captioningClient.js';
import { createVideoBucketUploader } from './services/videoBucketUploader.js';
import { createFilmStore } from './services/filmStore.js';
import { INSIDE_OUT_DETAILS } from './fixtures/insideOutDetails.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const researchAgent = createResearchAgent(config);
const captioningClient = createCaptioningClient(config);
const videoBucketUploader = createVideoBucketUploader({
  bucketName: config.videoClipsBucket,
  maxUploadBytes: config.maxVideoUploadBytes,
});
const filmStore = createFilmStore(
  INSIDE_OUT_DETAILS,
  [
    {
      title: 'Inside Out',
      script: '(sample script placeholder — mock data, not the real screenplay)',
      videoUrl: 'https://example.com/videos/inside-out-mock.mp4',
    },
  ],
  config.filmsDataFile,
);
const app = createApp({ config, researchAgent, captioningClient, videoBucketUploader, filmStore });

app.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
