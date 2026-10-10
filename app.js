// Entry point: `node app.js` (or `npm start`).
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const logger = require('./src/logger');

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});

// Finish in-flight requests before exiting (Docker / hosting restarts).
function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
