const crypto = require('crypto');
const path = require('path');
const express = require('express');
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_CALLER_ID,
  DIALER_PASSWORD,
  DIALER_IDENTITY = 'agent',
  PUBLIC_URL, // e.g. https://dialer.example.com — needed if behind a proxy that rewrites host
  PORT = 3000,
} = process.env;

const required = {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_CALLER_ID,
  DIALER_PASSWORD,
};
const missing = Object.keys(required).filter((k) => !required[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const E164 = /^\+[1-9]\d{6,14}$/;

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
app.post('/token', (req, res) => {
  if (!passwordMatches(req.body.password)) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity: DIALER_IDENTITY,
    ttl: 3600,
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    })
  );
  res.json({ token: token.toJwt(), identity: DIALER_IDENTITY, callerId: TWILIO_CALLER_ID });
});

// Only accept webhooks that really come from Twilio.
function validateTwilio(req, res, next) {
  const url = PUBLIC_URL
    ? PUBLIC_URL.replace(/\/$/, '') + req.originalUrl
    : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const ok = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    req.get('X-Twilio-Signature') || '',
    url,
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
    if (!E164.test(to)) {
      twiml.say('Please dial a full number including the country code.');
    } else {
      const dial = twiml.dial({ callerId: TWILIO_CALLER_ID, answerOnBridge: true });
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
