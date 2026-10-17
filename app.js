const express = require('express');
const axios = require('axios'); // Add axios for forwarding requests
const twilio = require('twilio');
const path = require('path');
const crypto = require('crypto');
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

// Browser dialer settings (Twilio Voice SDK)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID; // AC...
const TWILIO_API_KEY_SID = process.env.TWILIO_API_KEY_SID; // SK...
const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET; // shown once when the API key is created
const TWIML_APP_SID = process.env.TWIML_APP_SID; // AP...
const TWILIO_CALLER_ID = process.env.TWILIO_CALLER_ID; // your Twilio number, shown to the people you call
const DIALER_PASSWORD = process.env.DIALER_PASSWORD; // protects the /dialer page
const RING_BROWSER = process.env.RING_BROWSER === 'true'; // incoming calls also ring the /dialer page
const DIALER_IDENTITY = 'agent';

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

// Password check for the browser dialer (username can be anything)
function requireDialerPassword(req, res, next) {
  if (!DIALER_PASSWORD) {
    return res.status(503).send('Set DIALER_PASSWORD to use the dialer.');
  }
  const [scheme, encoded] = (req.get('Authorization') || '').split(' ');
  const password = scheme === 'Basic' && encoded
    ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':')
    : '';
  const given = crypto.createHash('sha256').update(password).digest();
  const expected = crypto.createHash('sha256').update(DIALER_PASSWORD).digest();
  if (crypto.timingSafeEqual(given, expected)) return next();

  res.set('WWW-Authenticate', 'Basic realm="Dialer"').status(401).send('Password required.');
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
  if (FORWARD_CALLS_TO || RING_BROWSER) {
    // Rings your phone and/or the browser dialer at the same time; first to answer gets the call
    const dial = response.dial({ answerOnBridge: true });
    if (RING_BROWSER) dial.client(DIALER_IDENTITY);
    if (FORWARD_CALLS_TO) dial.number(FORWARD_CALLS_TO);
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

// 6. Browser dialer page + its files
app.get('/dialer', requireDialerPassword, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dialer.html'));
});

app.get('/dialer/twilio.min.js', requireDialerPassword, (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', '@twilio', 'voice-sdk', 'dist', 'twilio.min.js'));
});

// 7. Access token so the browser can make and receive calls
app.get('/dialer/token', requireDialerPassword, (req, res) => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWIML_APP_SID) {
    return res.status(500).json({ error: 'Missing TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET or TWIML_APP_SID.' });
  }
  const { AccessToken } = twilio.jwt;
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity: DIALER_IDENTITY,
    ttl: 3600
  });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: TWIML_APP_SID, incomingAllow: true }));
  res.json({ token: token.toJwt() });
});

// 8. POST Route: Twilio asks what to do when the browser dialer places a call (TwiML App Voice URL)
app.post('/twilio/client-voice', validateTwilio, async (req, res) => {
  const to = String(req.body.To || '').trim();
  const response = new twilio.twiml.VoiceResponse();

  if (/^\+\d{8,15}$/.test(to) && TWILIO_CALLER_ID) {
    console.log(`Browser dialer calling ${to}.`);
    response.dial({ callerId: TWILIO_CALLER_ID, answerOnBridge: true }, to);
  } else {
    response.say('Sorry, that number is not valid.');
  }
  res.type('text/xml').send(response.toString());

  await forwardToN8n(N8N_TWILIO_VOICE_URL, { source: 'twilio_browser_call', ...req.body });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
