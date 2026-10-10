# Meta → n8n Webhook Relay

A small Express server that receives webhooks from **Meta** (WhatsApp Business, Instagram, Messenger), checks that they really came from Meta, and forwards them to your **n8n** workflow.

```
Meta  ──POST──▶  this relay  ──POST──▶  n8n workflow
       ◀─200 OK─   (verifies signature, retries on failure)
```

## Features

- Meta webhook handshake (`GET /`)
- **Signature verification** of every event (`X-Hub-Signature-256`) using your App Secret
- Replies `200` to Meta immediately and forwards in the background
- **Retries** with exponential backoff and a timeout when n8n is slow or down
- **Per-product routing**: WhatsApp, Instagram and Messenger can each go to a different n8n workflow
- Rate limiting, JSON (structured) logs, `/health` endpoint, graceful shutdown
- Tests (Jest + Supertest), Dockerfile, docker-compose with n8n, GitHub Actions CI

## 1. Quick start (beginner)

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
cp .env.example .env      # then open .env and fill in your values
npm start
```

The server listens on `http://localhost:3000`. Check it with:

```bash
curl http://localhost:3000/health   # {"status":"ok"}
```

> `npm start` does not load `.env` automatically. Export the variables in your shell, use
> `node --env-file=.env app.js` (Node 20+), or set them in your hosting dashboard.

## 2. Configuration

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | Port to listen on (default `3000`) |
| `VERIFY_TOKEN` | **yes** | Any string; must match the "Verify token" in the Meta dashboard |
| `APP_SECRET` | strongly recommended | Meta App Secret. When set, events without a valid signature are rejected with `401` |
| `N8N_WEBHOOK_URL` | **yes** | Default n8n Production Webhook URL |
| `N8N_WEBHOOK_URL_WHATSAPP` | no | Workflow for WhatsApp events |
| `N8N_WEBHOOK_URL_INSTAGRAM` | no | Workflow for Instagram events |
| `N8N_WEBHOOK_URL_MESSENGER` | no | Workflow for Messenger (Page) events |
| `FORWARD_TIMEOUT_MS` | no | Timeout per forward attempt (default `10000`) |
| `FORWARD_RETRIES` | no | Extra attempts after a failure (default `3`) |
| `RATE_LIMIT_PER_MINUTE` | no | Max requests per IP per minute (default `600`) |

## 3. Connect Meta and n8n

1. **n8n**: create a workflow with a **Webhook** node, method `POST`. Activate the workflow and copy its **Production URL** into `N8N_WEBHOOK_URL`.
2. **Deploy** this relay somewhere with a public HTTPS URL (Render, Railway, Fly.io, a VPS, ...).
3. **Meta**: in your app's dashboard → *Webhooks* (or *WhatsApp → Configuration*):
   - Callback URL: `https://your-relay.example.com/`
   - Verify token: the same value as `VERIFY_TOKEN`
   - Click *Verify and save*, then subscribe to the fields you need (for example `messages`).
4. Copy *App settings → Basic → App secret* into `APP_SECRET`.

Send a message to your WhatsApp number / Instagram account. It should appear in n8n's execution list.

## 4. Run with Docker (intermediate)

Relay only:

```bash
docker build -t meta-n8n-webhook-relay .
docker run --env-file .env -p 3000:3000 meta-n8n-webhook-relay
```

Relay **and** n8n together:

```bash
cp .env.example .env
docker compose up -d
```

n8n is then at `http://localhost:5678`. Inside Docker the relay reaches it at `http://n8n:5678/webhook/...`.

## 5. Development and tests

```bash
npm run dev    # restarts automatically on file changes
npm test       # runs the Jest test suite
```

GitHub Actions (`.github/workflows/ci.yml`) runs the tests on Node 20 and 22 and builds the Docker image on every push and pull request.

## Project structure

```
app.js             Entry point: loads config, starts the server, graceful shutdown
src/config.js      Reads environment variables
src/app.js         Express app: routes, signature check, rate limiting
src/signature.js   X-Hub-Signature-256 verification
src/forwarder.js   Routing + forwarding to n8n with retries
src/logger.js      JSON logger
test/              Jest tests
```

## Ideas for later

- Put events on a queue (for example Redis + BullMQ) so nothing is lost if n8n is down longer than the retries last.
- Move to TypeScript.
- Use n8n to send AI replies back via the WhatsApp Cloud API.
