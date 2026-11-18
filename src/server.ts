import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  logger.info('server.started', { port: config.port });
});
