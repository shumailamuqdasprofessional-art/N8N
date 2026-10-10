const axios = require('axios');
const logger = require('./logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Picks the n8n URL for a Meta payload: per-product route first, then the default.
function resolveTarget(payload, config) {
  const product = payload && payload.object;
  return (product && config.routes[product]) || config.n8nWebhookUrl;
}

// Posts the payload to n8n, retrying with exponential backoff (500ms, 1s, 2s, ...).
async function forward(payload, config, { http = axios, baseDelayMs = 500 } = {}) {
  const url = resolveTarget(payload, config);
  if (!url) {
    logger.warn('No n8n webhook URL configured; event dropped', { object: payload && payload.object });
    return false;
  }

  for (let attempt = 0; attempt <= config.forwardRetries; attempt++) {
    try {
      await http.post(url, payload, { timeout: config.forwardTimeoutMs });
      logger.info('Forwarded event to n8n', { object: payload.object, attempt: attempt + 1 });
      return true;
    } catch (error) {
      const last = attempt === config.forwardRetries;
      logger[last ? 'error' : 'warn']('Forwarding to n8n failed', {
        attempt: attempt + 1,
        error: error.message,
        status: error.response && error.response.status,
      });
      if (last) return false;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  return false;
}

module.exports = { forward, resolveTarget };
