const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const phonePattern = /^\d{8,15}$/;
const reply = (status, body, headers = {}) => Response.json(body, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers}
});

export function createContactHandler({env = process.env, fetchImpl = fetch, now = Date.now} = {}) {
  const attempts = new Map();
  let origin;
  try {
    const url = new URL(env.APP_ORIGIN);
    // http is accepted only for localhost/127.0.0.1, so `npm run dev` can be tested without
    // HTTPS. Neither hostname can ever be a real public deployment, so this never weakens
    // the check in production, where APP_ORIGIN is a real domain and must stay https.
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if ((url.protocol === 'https:' || (isLocalhost && url.protocol === 'http:')) && url.origin === env.APP_ORIGIN) origin = url;
  } catch { /* Missing configuration leaves sending unavailable. */ }
  const configured = Boolean(origin && env.MAILERSEND_API_TOKEN && env.RECAPTCHA_SECRET_KEY && env.RECAPTCHA_SITE_KEY &&
    emailPattern.test(env.MAIL_FROM_EMAIL || '') && emailPattern.test(env.CONTACT_TO_EMAIL || '') &&
    (!env.COPY_TO_EMAIL || emailPattern.test(env.COPY_TO_EMAIL)));
  // The WhatsApp number is public (it is shown to every visitor who opens the link)
  // and independent of the mail form, so it is exposed even when sending is not configured.
  const phoneNumber = phonePattern.test(env.PHONE_NUMBER || '') ? env.PHONE_NUMBER : '';
  const limited = ip => {
    const time = now();
    for (const [key, value] of attempts) if (time >= value.until) attempts.delete(key);
    const value = attempts.get(ip) || {count: 0, until: time + 600000};
    if (value.count >= 5 || (!attempts.has(ip) && attempts.size >= 5000)) return true;
    value.count += 1;
    attempts.set(ip, value);
    return false;
  };

  return async function handle(request, clientIP = 'unknown') {
    const path = new URL(request.url).pathname;
    if (path === '/api/contact/config.json') {
      if (request.method !== 'GET') return reply(405, {ok: false}, {Allow: 'GET'});
      return reply(200, {enabled: configured, siteKey: configured ? env.RECAPTCHA_SITE_KEY : '', phoneNumber});
    }
    if (path !== '/api/contact') return reply(404, {ok: false});
    if (request.method !== 'POST') return reply(405, {ok: false}, {Allow: 'POST'});
    if (!configured) return reply(503, {ok: false, message: 'O formulário está indisponível no momento. Fale conosco pelo WhatsApp.'});
    if (request.headers.get('origin') !== origin.origin) return reply(403, {ok: false, message: 'Recarregue o site para enviar sua mensagem.'});
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply(415, {ok: false});
    if (limited(clientIP)) return reply(429, {ok: false, message: 'Aguarde alguns minutos antes de tentar novamente.'}, {'Retry-After': '600'});
    let data;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 16384) return reply(413, {ok: false, message: 'Reduza o tamanho da mensagem.'});
      data = JSON.parse(raw);
    } catch { return reply(400, {ok: false, message: 'Confira os campos e tente novamente.'}); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(400, {ok: false});
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    const company = typeof data.company === 'string' ? data.company.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const token = typeof data.captchaToken === 'string' ? data.captchaToken : '';
    if (data.website || !name || name.length > 100 || /[\r\n]/.test(name) || !emailPattern.test(email) || email.length > 254 ||
      company.length > 160 || /[\r\n]/.test(company) || !message || message.length > 5000 || !token || token.length > 8192) {
      return reply(400, {ok: false, message: 'Confira nome, e-mail, mensagem e a verificação de segurança.'});
    }
    try {
      const verification = await fetchImpl('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST', body: new URLSearchParams({secret: env.RECAPTCHA_SECRET_KEY, response: token}),
        signal: AbortSignal.timeout(8000)
      });
      if (!verification.ok) throw new Error('captcha_unavailable');
      const captcha = await verification.json();
      // Google checks expiry and single use. challenge_ts is the challenge load time,
      // not the token issuance time; do not reject a visitor who took time to type.
      if (captcha.success !== true || captcha.hostname !== origin.hostname) {
        return reply(422, {ok: false, message: 'Confirme novamente a verificação de segurança.'});
      }
      // The visitor is Reply-To. Sender and recipient come only from server configuration.
      const delivery = await fetchImpl('https://api.mailersend.com/v1/email', {
        method: 'POST', headers: {'Authorization': `Bearer ${env.MAILERSEND_API_TOKEN}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          from: {email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME || 'Simbiose — Site'},
          to: [{email: env.CONTACT_TO_EMAIL}], ...(env.COPY_TO_EMAIL ? {cc: [{email: env.COPY_TO_EMAIL}]} : {}), reply_to: {email, name},
          subject: 'Novo contato pelo site da Simbiose',
          text: `Nome: ${name}\nE-mail: ${email}\nEmpresa: ${company || 'Não informada'}\n\nMensagem:\n${message}`
        }), signal: AbortSignal.timeout(12000)
      });
      if (delivery.status !== 202) throw new Error('mail_not_accepted');
      return reply(202, {ok: true});
    } catch {
      // Never log credentials or the visitor's message, and never pretend a failure succeeded.
      return reply(502, {ok: false, message: 'Não foi possível confirmar o envio. Tente novamente ou fale conosco pelo WhatsApp.'});
    }
  };
}
