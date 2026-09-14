import test from 'node:test';
import assert from 'node:assert/strict';
import {createVercelHandler} from './vercel-handler.mjs';

const env = {APP_ORIGIN: 'https://www.example.com', MAILERSEND_API_TOKEN: 'private-token', MAIL_FROM_EMAIL: 'site@example.com', CONTACT_TO_EMAIL: 'team@example.com', RECAPTCHA_SITE_KEY: 'public-key', RECAPTCHA_SECRET_KEY: 'private-secret', PHONE_NUMBER: '5531999999999'};
const fields = {name: 'Maria', email: 'maria@client.com', message: 'Olá, gostaria de conversar.', captchaToken: 'captcha-token'};
const post = () => new Request('https://www.example.com/api/contact', {
  method: 'POST', headers: {'Content-Type': 'application/json', Origin: env.APP_ORIGIN, 'x-vercel-forwarded-for': '192.0.2.1'},
  body: JSON.stringify(fields)
});

test('configuration works with original and rewritten URLs and exposes only the site key', async () => {
  const api = createVercelHandler('/api/contact/config.json', {env});
  for (const route of ['/api/contact-config', '/api/contact/config.json']) {
    const response = await api.fetch(new Request(env.APP_ORIGIN + route));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), {enabled: true, siteKey: 'public-key', phoneNumber: env.PHONE_NUMBER});
  }
  assert.equal((await api.fetch(post())).status, 405);
});

test('Vercel adapter preserves body, origin and per-instance client limit', async () => {
  const calls = [];
  const api = createVercelHandler('/api/contact', {env, fetchImpl: async (url, init) => {
    calls.push({url, init});
    if (url.includes('google.com')) return Response.json({success: true, hostname: 'www.example.com'});
    return new Response(null, {status: 202});
  }});
  for (let i = 0; i < 5; i++) assert.equal((await api.fetch(post())).status, 202);
  assert.equal((await api.fetch(post())).status, 429);
  assert.equal(calls.length, 10);
  const mail = JSON.parse(calls[1].init.body);
  assert.equal(mail.reply_to.email, fields.email);
  assert.equal(mail.to[0].email, env.CONTACT_TO_EMAIL);
});

test('actual Vercel entrypoints load without secrets and keep sending unavailable', async () => {
  const {default: config} = await import('../api/contact-config.js');
  const {default: contact} = await import('../api/contact.js');
  assert.equal(typeof config.fetch, 'function');
  assert.equal(typeof contact.fetch, 'function');
  const response = await config.fetch(new Request(env.APP_ORIGIN + '/api/contact-config'));
  assert.deepEqual(await response.json(), {enabled: false, siteKey: '', phoneNumber: ''});
  assert.equal((await contact.fetch(post())).status, 503);
});
