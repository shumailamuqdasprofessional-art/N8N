const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { isValidSignature } = require('./signature');
const { forward } = require('./forwarder');

function createApp(config, { forwardFn = forward } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Keep the raw body so the Meta signature can be verified byte-for-byte.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.rateLimitPerMinute,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  // Health check for hosting platforms (Render, Railway, Docker, ...).
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // 1. GET: Meta handshake verification
  app.get('/', (req, res) => {
    const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

    if (mode === 'subscribe' && config.verifyToken && token === config.verifyToken) {
      logger.info('Webhook verified');
      res.status(200).send(challenge);
    } else {
      logger.warn('Webhook verification failed');
      res.status(403).end();
    }
  });

  // 2. POST: receive Meta events and forward them to n8n
  app.post('/', (req, res) => {
    if (config.appSecret) {
      if (!isValidSignature(req.rawBody, req.get('x-hub-signature-256'), config.appSecret)) {
        logger.warn('Rejected event with invalid signature');
        return res.status(401).end();
      }
    } else {
      logger.warn('APP_SECRET not set; skipping signature verification');
    }

    logger.info('Webhook event received', { object: req.body && req.body.object });

    // Reply to Meta immediately, then forward in the background.
    res.status(200).end();
    forwardFn(req.body, config).catch((error) => {
      logger.error('Unexpected forwarding error', { error: error.message });
    });
  });

  // Malformed JSON and other errors
  app.use((err, req, res, next) => {
    logger.warn('Request error', { error: err.message });
    res.status(err.status || 500).end();
  });

  return app;
}

module.exports = { createApp };
