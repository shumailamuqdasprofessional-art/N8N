const express = require('express');
const axios = require('axios'); // Add axios for forwarding requests
const twilio = require('twilio');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio sends form-encoded data

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
// Paste your n8n Production Webhook URL in Environment Variables or here
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Twilio settings (all optional except where noted)
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN; // used to check requests really come from Twilio
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://your-app.onrender.com (needed for signature check behind a proxy)
const N8N_TWILIO_SMS_URL = process.env.N8N_TWILIO_SMS_URL || N8N_WEBHOOK_URL;
const N8N_TWILIO_VOICE_URL = process.env.N8N_TWILIO_VOICE_URL || N8N_WEBHOOK_URL;
const N8N_TWILIO_STATUS_URL = process.env.N8N_TWILIO_STATUS_URL || N8N_WEBHOOK_URL;
const CALL_GREETING = process.env.CALL_GREETING || 'Thank you for calling. Please hold while we connect you.';
const FORWARD_CALLS_TO = process.env.FORWARD_CALLS_TO; // your own phone, e.g. +15551234567

// Forward a payload to n8n without blocking the response
async function forwardToN8n(url, payload) {
  if (!url) return;
  try {
    await axios.post(url, payload);
    console.log('Successfully forwarded to n8n!');
  } catch (error) {
    console.error('Error forwarding to n8n:', error.message);
  }
}

// Reject requests that are not signed by Twilio (skipped if TWILIO_AUTH_TOKEN is not set)
function validateTwilio(req, res, next) {
  if (!TWILIO_AUTH_TOKEN) return next();

  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const url = base.replace(/\/$/, '') + req.originalUrl;
  const signature = req.get('X-Twilio-Signature') || '';

  if (twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body)) {
    return next();
  }
  console.warn('Rejected request with invalid Twilio signature.');
  res.status(403).end();
}

// 1. GET Route: Meta Handshake Verification
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// 2. POST Route: Receives Meta Messages & Forwards to n8n
app.post('/', async (req, res) => {
  console.log('Webhook event received from Meta.');

  // Send immediate 200 OK to Meta
  res.status(200).end();

  // Forward the payload asynchronously to n8n
  await forwardToN8n(N8N_WEBHOOK_URL, req.body);
});

// 3. POST Route: Incoming SMS / WhatsApp from Twilio -> n8n
app.post('/twilio/sms', validateTwilio, async (req, res) => {
  console.log(`Twilio message received from ${req.body.From}.`);

  // Empty TwiML = no automatic reply here; n8n sends the reply
  res.type('text/xml').send(new twilio.twiml.MessagingResponse().toString());

  await forwardToN8n(N8N_TWILIO_SMS_URL, { source: 'twilio_sms', ...req.body });
});

// 4. POST Route: Incoming phone call from Twilio -> greeting + forward to your phone
app.post('/twilio/voice', validateTwilio, async (req, res) => {
  console.log(`Twilio call received from ${req.body.From}.`);

  const response = new twilio.twiml.VoiceResponse();
  response.say(CALL_GREETING);
  if (FORWARD_CALLS_TO) {
    response.dial(FORWARD_CALLS_TO);
  } else {
    response.say('Sorry, no one is available right now. Please leave a message after the beep.');
    response.record({ maxLength: 120 });
  }
  res.type('text/xml').send(response.toString());

  await forwardToN8n(N8N_TWILIO_VOICE_URL, { source: 'twilio_call', ...req.body });
});

// 5. POST Route: Delivery / call status updates from Twilio -> n8n
app.post('/twilio/status', validateTwilio, async (req, res) => {
  res.status(200).end();

  await forwardToN8n(N8N_TWILIO_STATUS_URL, { source: 'twilio_status', ...req.body });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
