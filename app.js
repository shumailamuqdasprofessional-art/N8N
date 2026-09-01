const express = require('express');
const axios = require('axios'); // Add axios for forwarding requests
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
// Paste your n8n Production Webhook URL in Environment Variables or here
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; 

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
  if (N8N_WEBHOOK_URL) {
    try {
      await axios.post(N8N_WEBHOOK_URL, req.body);
      console.log('Successfully forwarded to n8n!');
    } catch (error) {
      console.error('Error forwarding to n8n:', error.message);
    }
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
