import { createApp } from './app.js';
import { createDialogflowClient } from './services/dialogflowClient.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const dialogflowClient = createDialogflowClient(config);
const app = createApp({ config, dialogflowClient });

app.listen(config.port, () => {
  console.log(`backend listening on :${config.port}`);
});
