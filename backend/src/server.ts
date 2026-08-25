import 'dotenv/config';
import { createApp } from './app.js';
import { createDialogflowClient } from './services/dialogflowClient.js';
import { createResearchAgent } from './services/researchAgent.js';
import { createCaptioningClient } from './services/captioningClient.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const dialogflowClient = createDialogflowClient(config);
const researchAgent = createResearchAgent(config);
const captioningClient = createCaptioningClient(config);
const app = createApp({ config, dialogflowClient, researchAgent, captioningClient });

app.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
