// Reads all settings from environment variables.
function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    verifyToken: env.VERIFY_TOKEN,
    // App Secret from the Meta developer dashboard, used to verify X-Hub-Signature-256.
    appSecret: env.APP_SECRET,
    // Default n8n webhook, plus optional per-product overrides.
    n8nWebhookUrl: env.N8N_WEBHOOK_URL,
    routes: {
      whatsapp_business_account: env.N8N_WEBHOOK_URL_WHATSAPP,
      instagram: env.N8N_WEBHOOK_URL_INSTAGRAM,
      page: env.N8N_WEBHOOK_URL_MESSENGER,
    },
    forwardTimeoutMs: Number(env.FORWARD_TIMEOUT_MS) || 10000,
    forwardRetries: env.FORWARD_RETRIES !== undefined ? Number(env.FORWARD_RETRIES) : 3,
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE) || 600,
  };
}

module.exports = { loadConfig };
