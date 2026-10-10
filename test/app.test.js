const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { forward, resolveTarget } = require('../src/forwarder');
const { isValidSignature } = require('../src/signature');

const SECRET = 'test-secret';
const sign = (body) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

function makeApp(overrides = {}) {
  const config = { ...loadConfig({ VERIFY_TOKEN: 'abc', APP_SECRET: SECRET }), ...overrides };
  const forwardFn = jest.fn().mockResolvedValue(true);
  return { app: createApp(config, { forwardFn }), forwardFn };
}

describe('GET / (verification)', () => {
  test('returns the challenge for a valid token', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'abc', 'hub.challenge': '42' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('42');
  });

  test('rejects a wrong token', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' });
    expect(res.status).toBe(403);
  });

  test('rejects when VERIFY_TOKEN is not configured', async () => {
    const { app } = makeApp({ verifyToken: undefined });
    const res = await request(app).get('/').query({ 'hub.mode': 'subscribe', 'hub.challenge': '42' });
    expect(res.status).toBe(403);
  });
});

describe('POST / (events)', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  test('accepts a correctly signed event and forwards it', async () => {
    const { app, forwardFn } = makeApp();
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(body)).send(body);
    expect(res.status).toBe(200);
    expect(forwardFn).toHaveBeenCalledWith(JSON.parse(body), expect.any(Object));
  });

  test('rejects an event with a bad signature', async () => {
    const { app, forwardFn } = makeApp();
    const res = await request(app).post('/').set('Content-Type', 'application/json').set('X-Hub-Signature-256', 'sha256=deadbeef').send(body);
    expect(res.status).toBe(401);
    expect(forwardFn).not.toHaveBeenCalled();
  });

  test('rejects an event with no signature', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/').set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(401);
  });

  test('returns 400 for malformed JSON', async () => {
    const { app } = makeApp({ appSecret: undefined });
    const res = await request(app).post('/').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('signature', () => {
  test('validates and rejects correctly', () => {
    const raw = Buffer.from('{"a":1}');
    expect(isValidSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(isValidSignature(raw, sign(raw), 'other')).toBe(false);
    expect(isValidSignature(raw, 'md5=abc', SECRET)).toBe(false);
  });
});

describe('forwarder', () => {
  const config = {
    ...loadConfig({ N8N_WEBHOOK_URL: 'http://default', N8N_WEBHOOK_URL_INSTAGRAM: 'http://ig', FORWARD_RETRIES: '2' }),
  };

  test('routes by product with fallback', () => {
    expect(resolveTarget({ object: 'instagram' }, config)).toBe('http://ig');
    expect(resolveTarget({ object: 'page' }, config)).toBe('http://default');
  });

  test('retries then succeeds', async () => {
    const http = { post: jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({}) };
    await expect(forward({ object: 'page' }, config, { http, baseDelayMs: 1 })).resolves.toBe(true);
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  test('gives up after the configured retries', async () => {
    const http = { post: jest.fn().mockRejectedValue(new Error('down')) };
    await expect(forward({ object: 'page' }, config, { http, baseDelayMs: 1 })).resolves.toBe(false);
    expect(http.post).toHaveBeenCalledTimes(3);
  });

  test('drops the event when no URL is configured', async () => {
    const http = { post: jest.fn() };
    await expect(forward({ object: 'page' }, loadConfig({}), { http })).resolves.toBe(false);
    expect(http.post).not.toHaveBeenCalled();
  });
});
