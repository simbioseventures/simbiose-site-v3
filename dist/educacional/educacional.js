(() => {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();

  // Same mechanism as the home (app.js): the WhatsApp number comes from PHONE_NUMBER on the
  // server. Links keep a numberless https://wa.me/ fallback if this fetch fails.
  const whatsappLinks = [...document.querySelectorAll('[data-whatsapp-contact]')];
  if (whatsappLinks.length) {
    fetch('/api/contact/config.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)})
      .then(response => response.ok ? response.json() : null)
      .then(config => {
        if (!config?.phoneNumber) return;
        whatsappLinks.forEach(link => {
          const url = new URL(link.href);
          url.pathname = `/${config.phoneNumber}`;
          link.href = url.toString();
        });
      })
      .catch(() => { /* Links keep working without the number via WhatsApp's contact picker. */ });
  }

  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, {passive: true});

  // Mobile only: keep the main CTA at hand once the hero is gone, but step aside near the
  // form and the footer so it never covers them.
  const dock = document.querySelector('.mobile-dock');
  if (!dock || !('IntersectionObserver' in window)) return;
  const watched = [document.getElementById('inicio'), document.getElementById('contato'), document.querySelector('.site-footer')];
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
    dock.hidden = visible.size > 0;
  });
  watched.forEach(element => element && observer.observe(element));
})();
