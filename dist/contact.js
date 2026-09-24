(() => {
  'use strict';
  const form = document.getElementById('contact-form');
  if (!form) return;
  const submit = form.querySelector('[type="submit"]');
  const status = document.getElementById('contact-status');
  const captcha = document.getElementById('contact-captcha');
  const result = document.getElementById('contact-result');
  const nameInput = document.getElementById('contact-name');
  const emailInput = document.getElementById('contact-email');
  const emailError = document.getElementById('contact-email-error');
  const messageInput = document.getElementById('contact-message');
  const defaultButton = submit.innerHTML;
  // Pages other than the home (e.g. /educacional) tag the message so the team knows where it came from.
  const messagePrefix = form.dataset.messagePrefix || '';
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let widget;
  let token = '';
  let sending = false;
  let emailTouched = false;
  let lastPayload = null;

  const setStatus = (message, state = '') => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const invalidate = message => {
    token = '';
    submit.disabled = true;
    if (message) setStatus(message, 'error');
  };

  // The name field never accepts digits: block them as they are typed (covers paste and
  // IME input too, since a stray digit is stripped right after it lands in the value).
  nameInput.addEventListener('beforeinput', event => {
    if (event.data && /[0-9]/.test(event.data)) event.preventDefault();
  });
  nameInput.addEventListener('input', () => {
    if (!/[0-9]/.test(nameInput.value)) return;
    const caret = nameInput.selectionStart;
    nameInput.value = nameInput.value.replace(/[0-9]/g, '');
    if (caret !== null) nameInput.setSelectionRange(caret - 1, caret - 1);
  });
  const setInvalid = (field, invalid) => {
    if (invalid) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  };
  const updateNameError = forceShow => {
    const invalid = nameInput.value.trim().length === 0;
    setInvalid(nameInput, invalid && forceShow);
    return !invalid;
  };
  nameInput.addEventListener('blur', () => updateNameError(true));

  // Real-time feedback only kicks in once the visitor has left the field (or tried to
  // submit); showing "invalid" after the very first keystroke would be premature.
  const updateEmailError = forceShow => {
    const invalid = !emailPattern.test(emailInput.value.trim());
    const show = invalid && (forceShow || emailTouched);
    setInvalid(emailInput, show);
    emailError.hidden = !show;
    return !invalid;
  };
  emailInput.addEventListener('blur', () => { emailTouched = true; updateEmailError(); });
  emailInput.addEventListener('input', () => { if (emailTouched) updateEmailError(); });

  const updateMessageError = forceShow => {
    const invalid = messageInput.value.trim().length === 0;
    setInvalid(messageInput, invalid && forceShow);
    return !invalid;
  };
  messageInput.addEventListener('blur', () => updateMessageError(true));

  async function initialize() {
    try {
      const response = await fetch('/api/contact/config.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
      if (!response.ok) return;
      const config = await response.json();
      if (!config.enabled || !config.siteKey) return;
      setStatus('Carregando a verificação de segurança…');
      const timeout = setTimeout(() => invalidate('Não foi possível carregar a verificação. Recarregue a página ou fale conosco pelo WhatsApp.'), 15000);
      window.simbioseContactCaptchaReady = () => {
        clearTimeout(timeout);
        captcha.hidden = false;
        widget = window.grecaptcha.render(captcha, {
          sitekey: config.siteKey,
          theme: 'light',
          size: captcha.clientWidth < 304 ? 'compact' : 'normal',
          callback: value => {
            token = value;
            submit.disabled = sending;
            setStatus('Tudo pronto para enviar sua mensagem.');
          },
          'expired-callback': () => invalidate('A verificação expirou. Confirme novamente para enviar.'),
          'error-callback': () => invalidate('Não foi possível concluir a verificação. Tente novamente ou fale conosco pelo WhatsApp.')
        });
        setStatus('Preencha os campos e confirme a verificação para enviar.');
      };
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?onload=simbioseContactCaptchaReady&render=explicit&hl=pt-BR';
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        clearTimeout(timeout);
        invalidate('Não foi possível carregar a verificação. Recarregue a página ou fale conosco pelo WhatsApp.');
      };
      document.head.append(script);
    } catch {
      setStatus('O formulário está indisponível no momento. Fale conosco pelo WhatsApp.');
    }
  }

  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6"/><path d="M12 16.5h.01"/></svg>'
  };
  // Every string interpolated here is a fixed, hardcoded label or a server error message
  // that is only ever one of the app's own known messages (see server/contact.mjs) —
  // never visitor input — so building this as a template string stays safe.
  function renderResult(state, title, message, actions) {
    result.dataset.state = state;
    result.innerHTML = `<div class="contact-result-icon">${icons[state]}</div>
      <h4 tabindex="-1">${title}</h4>
      <p>${message}</p>
      <div class="contact-result-actions">${actions.map(a =>
        `<button type="button" class="button ${a.className}" data-action="${a.action}">${a.label}</button>`
      ).join('')}</div>`;
    form.hidden = true;
    result.hidden = false;
    result.querySelector('h4').focus();
  }

  function showSuccess() {
    lastPayload = null;
    renderResult('success', 'Mensagem enviada!', 'Recebemos sua mensagem e responderemos o mais rápido possível.',
      [{action: 'new-message', className: 'button-dark', label: 'Enviar uma nova mensagem'}]);
  }

  function showError(message) {
    renderResult('error', 'Não foi possível enviar',
      message || 'Algo deu errado no envio. Tente novamente ou fale conosco pelo WhatsApp.',
      [
        {action: 'retry', className: 'button-dark', label: 'Tentar novamente'},
        {action: 'restart', className: 'button-outline', label: 'Digitar nova mensagem'}
      ]);
  }

  function resetForm() {
    lastPayload = null;
    form.reset();
    emailTouched = false;
    nameInput.removeAttribute('aria-invalid');
    emailInput.removeAttribute('aria-invalid');
    messageInput.removeAttribute('aria-invalid');
    emailError.hidden = true;
    invalidate();
    if (widget !== undefined) window.grecaptcha.reset(widget);
    setStatus(captcha.hidden ? '' : 'Preencha os campos e confirme a verificação para enviar.');
    result.hidden = true;
    result.innerHTML = '';
    form.hidden = false;
    nameInput.focus();
  }

  async function sendPayload(payload) {
    sending = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      const outcome = await response.json().catch(() => ({}));
      if (response.status === 202 && outcome.ok === true) {
        // A used token cannot be verified again; only a real success retires it.
        token = '';
        if (widget !== undefined) window.grecaptcha.reset(widget);
        showSuccess();
      } else {
        showError(outcome.message);
      }
    } catch {
      showError('Não foi possível confirmar o envio. Tente novamente ou fale conosco pelo WhatsApp.');
    } finally {
      sending = false;
      form.removeAttribute('aria-busy');
      submit.disabled = !token;
      submit.innerHTML = defaultButton;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (sending) return;
    const nameOk = updateNameError(true);
    const emailOk = updateEmailError(true);
    emailTouched = true;
    const messageOk = updateMessageError(true);
    if (!nameOk) { nameInput.focus(); return; }
    if (!emailOk) { emailInput.focus(); return; }
    if (!messageOk) { messageInput.focus(); return; }
    if (!token) { setStatus('Confirme a verificação de segurança para enviar.', 'error'); return; }
    const data = new FormData(form);
    lastPayload = {
      name: data.get('name'), email: data.get('email'), company: data.get('company'),
      message: messagePrefix + data.get('message'), website: data.get('website'), captchaToken: token
    };
    submit.textContent = 'Enviando…';
    setStatus('Enviando sua mensagem…');
    sendPayload(lastPayload);
  });

  // A failed send never loses the visitor's data or a still-unused captcha token: "Tentar
  // novamente" resubmits exactly what was sent. "Digitar nova mensagem" starts over.
  result.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'retry' && lastPayload) {
      result.querySelectorAll('button').forEach(candidate => { candidate.disabled = true; });
      const message = result.querySelector('p');
      if (message) message.textContent = 'Tentando novamente…';
      sendPayload(lastPayload);
    } else {
      resetForm();
    }
  });

  // Load the external verification only when the visitor approaches the form.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); initialize(); }
    }, {rootMargin: '400px'});
    observer.observe(form);
  } else initialize();
})();
