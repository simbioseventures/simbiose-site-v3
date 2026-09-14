import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactHandler} from './contact.mjs';

const env = {APP_ORIGIN: 'https://www.example.com', MAILERSEND_API_TOKEN: 'server-token', MAIL_FROM_EMAIL: 'site@example.com', MAIL_FROM_NAME: 'Simbiose', CONTACT_TO_EMAIL: 'team@example.com', RECAPTCHA_SITE_KEY: 'public-key', RECAPTCHA_SECRET_KEY: 'server-secret', PHONE_NUMBER: '5531999999999'};
const data = {name: 'Maria', email: 'maria@client.com', company: 'Cliente', message: 'Gostaria de automatizar meu atendimento.', captchaToken: 'captcha-token'};
const currentTime = Date.parse('2026-09-14T12:00:00Z');
const validCaptcha = {success: true, hostname: 'www.example.com', challenge_ts: new Date(currentTime).toISOString()};
const request = (body = data, origin = env.APP_ORIGIN) => new Request('https://www.example.com/api/contact', {
  method: 'POST', headers: {'Content-Type': 'application/json', origin}, body: JSON.stringify(body)
});
const fixture = (captcha = validCaptcha, mailStatus = 202) => {
  const calls = [];
  return {calls, handler: createContactHandler({env, now: () => currentTime, fetchImpl: async (url, init) => {
    calls.push({url, init});
    return url.includes('google.com') ? Response.json(captcha) : new Response(null, {status: mailStatus});
  }})};
};

test('missing credentials fail closed and config never exposes secrets', async () => {
  const handler = createContactHandler({env: {}});
  assert.deepEqual(await (await handler(new Request('https://www.example.com/api/contact/config.json'))).json(), {enabled: false, siteKey: '', phoneNumber: ''});
  assert.equal((await handler(request())).status, 503);
  const {handler: enabled} = fixture();
  assert.deepEqual(await (await enabled(new Request('https://www.example.com/api/contact/config.json'))).json(), {enabled: true, siteKey: 'public-key', phoneNumber: env.PHONE_NUMBER});
});

test('PHONE_NUMBER is exposed regardless of mail configuration, and rejected when malformed', async () => {
  const mailUnconfigured = createContactHandler({env: {PHONE_NUMBER: env.PHONE_NUMBER}});
  assert.deepEqual(await (await mailUnconfigured(new Request('https://www.example.com/api/contact/config.json'))).json(), {enabled: false, siteKey: '', phoneNumber: env.PHONE_NUMBER});
  const malformed = createContactHandler({env: {...env, PHONE_NUMBER: '+55 31 99999-9999'}});
  assert.deepEqual(await (await malformed(new Request('https://www.example.com/api/contact/config.json'))).json(), {enabled: true, siteKey: 'public-key', phoneNumber: ''});
});

test('APP_ORIGIN over http is accepted only for localhost/127.0.0.1, and must still match exactly', async () => {
  for (const localOrigin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
    const localEnv = {...env, APP_ORIGIN: localOrigin};
    const localHandler = createContactHandler({env: localEnv, now: () => currentTime, fetchImpl: async (url, init) => {
      const localCaptcha = {success: true, hostname: new URL(localOrigin).hostname, challenge_ts: new Date(currentTime).toISOString()};
      return url.includes('google.com') ? Response.json(localCaptcha) : new Response(null, {status: 202});
    }});
    const localRequest = new Request(`${localOrigin}/api/contact`, {
      method: 'POST', headers: {'Content-Type': 'application/json', origin: localOrigin}, body: JSON.stringify(data)
    });
    assert.equal((await localHandler(localRequest)).status, 202);
  }
  // Any other host over http stays rejected: only localhost/127.0.0.1 get the http exception.
  const otherHttp = createContactHandler({env: {...env, APP_ORIGIN: 'http://example.com'}});
  assert.equal((await otherHttp(request())).status, 503);
});

test('sender and recipient cannot be supplied by visitor; Reply-To uses visitor', async () => {
  const {handler, calls} = fixture();
  assert.equal((await handler(request({...data, from: 'attacker@other.com', to: 'attacker@other.com'}))).status, 202);
  assert.equal(calls.length, 2);
  const payload = JSON.parse(calls[1].init.body);
  assert.equal(payload.from.email, env.MAIL_FROM_EMAIL);
  assert.equal(payload.to[0].email, env.CONTACT_TO_EMAIL);
  assert.equal(payload.reply_to.email, data.email);
  assert.equal(new URLSearchParams(calls[0].init.body).get('secret'), env.RECAPTCHA_SECRET_KEY);
});

test('COPY_TO_EMAIL is optional; when set it is cc\'d, when invalid the form fails closed', async () => {
  const withCopy = {...env, COPY_TO_EMAIL: 'copy@example.com'};
  const calls = [];
  const handler = createContactHandler({env: withCopy, now: () => currentTime, fetchImpl: async (url, init) => {
    calls.push({url, init});
    return url.includes('google.com') ? Response.json(validCaptcha) : new Response(null, {status: 202});
  }});
  assert.equal((await handler(request())).status, 202);
  const payload = JSON.parse(calls[1].init.body);
  assert.deepEqual(payload.cc, [{email: 'copy@example.com'}]);

  const invalidCopy = createContactHandler({env: {...env, COPY_TO_EMAIL: 'not-an-email'}});
  assert.equal((await invalidCopy(request())).status, 503);
});

test('invalid, expired or foreign-host captcha never reaches MailerSend', async () => {
  for (const captcha of [{...validCaptcha, success: false}, {...validCaptcha, hostname: 'other.com'}, {success: false, 'error-codes': ['timeout-or-duplicate']}]) {
    const {handler, calls} = fixture(captcha);
    assert.equal((await handler(request())).status, 422);
    assert.equal(calls.length, 1);
  }
});

test('invalid fields, honeypot and bad origin are rejected before external calls', async () => {
  for (const body of [{...data, email: 'invalid'}, {...data, name: '  '}, {...data, website: 'spam'}, {...data, message: 'x'.repeat(5001)}, {...data, captchaToken: ''}]) {
    const {handler, calls} = fixture();
    assert.equal((await handler(request(body))).status, 400);
    assert.equal(calls.length, 0);
  }
  const {handler, calls} = fixture();
  assert.equal((await handler(request(data, 'https://other.com'))).status, 403);
  assert.equal(calls.length, 0);
});

test('provider failure or timeout is never reported as a successful send', async () => {
  const {handler} = fixture(validCaptcha, 422);
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).ok, false);
  const unavailable = createContactHandler({env, fetchImpl: async () => { throw new Error('timeout'); }});
  assert.equal((await unavailable(request())).status, 502);
});

test('rate limit blocks a sixth attempt before contacting providers', async () => {
  const {handler, calls} = fixture();
  for (let index = 0; index < 5; index++) assert.equal((await handler(request(), '192.0.2.1')).status, 202);
  assert.equal((await handler(request(), '192.0.2.1')).status, 429);
  assert.equal(calls.length, 10);
});

test('malformed and oversized payloads are rejected', async () => {
  const {handler, calls} = fixture();
  assert.equal((await handler(request({...data, message: 'x'.repeat(17000)}))).status, 413);
  const malformed = new Request('https://www.example.com/api/contact', {method: 'POST', headers: {'Content-Type': 'application/json', origin: env.APP_ORIGIN}, body: '{'});
  assert.equal((await handler(malformed)).status, 400);
  assert.equal(calls.length, 0);
});
