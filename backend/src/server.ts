import 'dotenv/config';
import { createApp } from './app.js';
import { createDialogflowClient } from './services/dialogflowClient.js';
import { createResearchAgent } from './services/researchAgent.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const dialogflowClient = createDialogflowClient(config);
const researchAgent = createResearchAgent(config);
const app = createApp({ config, dialogflowClient, researchAgent });

app.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
