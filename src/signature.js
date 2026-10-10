const crypto = require('crypto');

// Checks Meta's X-Hub-Signature-256 header ("sha256=<hex>") against the raw request body.
function isValidSignature(rawBody, header, appSecret) {
  if (!rawBody || !header || !appSecret) return false;
  const [algo, signature] = header.split('=');
  if (algo !== 'sha256' || !signature) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { isValidSignature };
