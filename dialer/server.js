const crypto = require('crypto');
const path = require('path');
const express = require('express');
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  DIALER_PASSWORD,
  // Everything below is optional — the dialer sets it up automatically.
  TWILIO_CALLER_ID, // which of your Twilio numbers to call from (default: the first one)
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  PUBLIC_URL, // e.g. https://dialer.example.com (default: taken from the browser's address)
  DIALER_IDENTITY = 'agent',
  PORT = 3000,
} = process.env;

const required = { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DIALER_PASSWORD };
const missing = Object.keys(required).filter((k) => !required[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const APP_NAME = 'Twilio Dialer';
const E164 = /^\+[1-9]\d{6,14}$/;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

// --- Automatic Twilio setup ---------------------------------------------

let setup = null; // { apiKey, apiSecret, appSid, callerId, baseUrl }
let setupPromise = null;

// Twilio only shows an API key's secret once, so on each start we replace
// the dialer's old key with a fresh one (unless one was given in the env).
async function getApiKey() {
  if (TWILIO_API_KEY && TWILIO_API_SECRET) {
    return { apiKey: TWILIO_API_KEY, apiSecret: TWILIO_API_SECRET };
  }
  const old = await client.keys.list();
  await Promise.all(old.filter((k) => k.friendlyName === APP_NAME).map((k) => client.keys(k.sid).remove()));
  const key = await client.newKeys.create({ friendlyName: APP_NAME });
  return { apiKey: key.sid, apiSecret: key.secret };
}

// Create (or update) the TwiML App that tells Twilio where to ask what to do with browser calls.
async function getTwimlApp(voiceUrl) {
  const [existing] = await client.applications.list({ friendlyName: APP_NAME, limit: 1 });
  const settings = { voiceUrl, voiceMethod: 'POST' };
  const app = existing
    ? await client.applications(existing.sid).update(settings)
    : await client.applications.create({ friendlyName: APP_NAME, ...settings });
  return app.sid;
}

// Pick the number to call from, and make incoming calls to it ring the dialer
// (only when that number isn't already set up to do something else).
async function getCallerId(appSid) {
  const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
  const voiceNumbers = numbers.filter((n) => n.capabilities && n.capabilities.voice);
  const number = TWILIO_CALLER_ID
    ? voiceNumbers.find((n) => n.phoneNumber === TWILIO_CALLER_ID)
    : voiceNumbers[0];
  if (!number) {
    throw new Error(
      TWILIO_CALLER_ID
        ? `${TWILIO_CALLER_ID} is not a voice number on this Twilio account`
        : 'This Twilio account has no phone number with Voice. Buy one in the Twilio Console first.'
    );
  }

  const unused = !number.voiceApplicationSid && (!number.voiceUrl || number.voiceUrl.includes('demo.twilio.com'));
  if (number.voiceApplicationSid === appSid) {
    // already connected
  } else if (unused) {
    await client.incomingPhoneNumbers(number.sid).update({ voiceApplicationSid: appSid });
    console.log(`Incoming calls to ${number.phoneNumber} now ring the dialer.`);
  } else {
    console.log(
      `${number.phoneNumber} already has its own incoming-call settings, so they were left alone. ` +
        `To answer its calls in the dialer, set "A call comes in" to the TwiML App "${APP_NAME}" in the Twilio Console.`
    );
  }
  return number.phoneNumber;
}

async function runSetup(baseUrl) {
  const voiceUrl = `${baseUrl}/voice`;
  const { apiKey, apiSecret } = setup && setup.apiKey ? setup : await getApiKey();
  const appSid = await getTwimlApp(voiceUrl);
  const callerId = await getCallerId(appSid);
  setup = { apiKey, apiSecret, appSid, callerId, baseUrl };
  console.log(`Twilio is set up: calling from ${callerId}, webhook ${voiceUrl}`);
  return setup;
}

function ensureSetup(baseUrl) {
  if (setup && setup.baseUrl === baseUrl) return Promise.resolve(setup);
  if (!setupPromise) {
    setupPromise = runSetup(baseUrl).finally(() => {
      setupPromise = null;
    });
  }
  return setupPromise;
}

function baseUrlOf(req) {
  return (PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// --- Web server ----------------------------------------------------------

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/twilio.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/@twilio/voice-sdk/dist/twilio.min.js'));
});

function passwordMatches(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(DIALER_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// 1. Browser asks for an Access Token so it can place/receive calls.
app.post('/token', async (req, res) => {
  if (!passwordMatches(req.body.password)) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const baseUrl = baseUrlOf(req);
  if (!baseUrl.startsWith('https://') && !/\/\/(localhost|127\.0\.0\.1)[:/]?/.test(baseUrl + '/')) {
    return res.status(400).json({ error: 'Open the dialer with an https:// address so Twilio and the microphone work.' });
  }

  let s;
  try {
    s = await ensureSetup(baseUrl);
  } catch (err) {
    console.error('Twilio setup failed:', err.message);
    const msg = err.status === 401 ? 'Twilio rejected the Account SID / Auth Token.' : err.message;
    return res.status(500).json({ error: `Twilio setup failed: ${msg}` });
  }

  const token = new AccessToken(TWILIO_ACCOUNT_SID, s.apiKey, s.apiSecret, {
    identity: DIALER_IDENTITY,
    ttl: 3600,
  });
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: s.appSid, incomingAllow: true }));
  res.json({ token: token.toJwt(), identity: DIALER_IDENTITY, callerId: s.callerId });
});

// Only accept webhooks that really come from Twilio.
function validateTwilio(req, res, next) {
  const ok = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    req.get('X-Twilio-Signature') || '',
    baseUrlOf(req) + req.originalUrl,
    req.body
  );
  if (!ok) return res.status(403).send('Invalid Twilio signature');
  next();
}

// 2. Voice webhook — used by the TwiML App (outgoing) and your Twilio number (incoming).
app.post('/voice', validateTwilio, (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = req.body.From || '';

  if (from.startsWith('client:')) {
    // Outgoing call from the browser dialer.
    const to = (req.body.To || '').trim();
    const callerId = (setup && setup.callerId) || TWILIO_CALLER_ID;
    if (!E164.test(to)) {
      twiml.say('Please dial a full number including the country code.');
    } else if (!callerId) {
      twiml.say('The dialer is not set up yet. Please log in again.');
    } else {
      const dial = twiml.dial({ callerId, answerOnBridge: true });
      dial.number(to);
    }
  } else {
    // Incoming call to your Twilio number — ring the browser.
    const dial = twiml.dial({ answerOnBridge: true, timeout: 25 });
    dial.client(DIALER_IDENTITY);
  }

  res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => console.log(`Dialer running on http://localhost:${PORT}`));
