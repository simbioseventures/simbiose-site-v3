(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileViewport = window.matchMedia('(max-width: 1000px)');
  const root = document.documentElement;
  const hero = document.getElementById('inicio');
  const headerShell = document.querySelector('.header-shell');
  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  const dock = document.querySelector('.mobile-contact-dock');
  const closing = document.getElementById('contato');
  const activeAnimations = new Set();
  const activeCounters = new Set();
  const ease = 'cubic-bezier(.22,1,.36,1)';
  let heroVisible = true;
  let closingVisible = false;
  let footerVisible = false;

  function updateDock() {
    const visible = mobileViewport.matches && !heroVisible && !closingVisible && !footerVisible && mobileNav.hidden;
    dock.hidden = !visible;
  }

  function closeMenu() {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menu');
    mobileNav.hidden = true;
    updateDock();
  }

  menuButton.addEventListener('click', () => {
    const opening = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(opening));
    menuButton.setAttribute('aria-label', opening ? 'Fechar menu' : 'Abrir menu');
    mobileNav.hidden = !opening;
    updateDock();
  });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !mobileNav.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) closeMenu();
  });
  mobileViewport.addEventListener('change', () => {
    if (!mobileViewport.matches) closeMenu();
    updateDock();
  });
  document.getElementById('year').textContent = new Date().getFullYear();

  // The WhatsApp number is not committed to the codebase; it is read from PHONE_NUMBER on
  // the server and injected here. Links keep a numberless https://wa.me/ fallback in the
  // markup, so they still open WhatsApp's contact picker if this fetch fails or is slow.
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

  function animateElement(element, frames, options = {}) {
    if (reducedMotion.matches || typeof element.animate !== 'function') return;
    const animation = element.animate(frames, {duration: mobileViewport.matches ? 1000 : 1150, easing: 'cubic-bezier(.25,.46,.45,.94)', fill: 'backwards', ...options});
    activeAnimations.add(animation);
    const cleanup = () => activeAnimations.delete(animation);
    animation.addEventListener('finish', cleanup, {once: true});
    animation.addEventListener('cancel', cleanup, {once: true});
  }

  function reveal(element, delay = 0, variant = 'content') {
    element.removeAttribute('data-entrance-pending');
    element.classList.add('is-revealed');
    if (variant === 'image') {
      animateElement(element, [{opacity: .3, clipPath: 'inset(0 100% 0 0 round 12px)'}, {opacity: 1, clipPath: 'inset(0 0% 0 0 round 12px)'}], {duration: 820, delay});
    } else if (variant !== 'none') {
      const distance = mobileViewport.matches ? 22 : 30;
      animateElement(element, [{opacity: 0, transform: `translate3d(0,${distance}px,0)`}, {opacity: 1, transform: 'translate3d(0,0,0)'}], {delay});
    }
  }

  // Visible values start at zero in the HTML; assistive technology gets the totals.
  const metrics = [...document.querySelectorAll('.client-metrics dd')].map(dd => {
    const finalText = dd.querySelector('.metric-total').textContent.trim();
    return {visual: dd.querySelector('.metric-value'), finalText, target: Number.parseInt(finalText, 10)};
  });
  let metricsStarted = false;
  function finishMetrics() {
    metricsStarted = true;
    [...activeCounters].forEach(finish => finish());
    metrics.forEach(({visual, finalText}) => { visual.textContent = finalText; });
  }
  function countMetrics() {
    if (metricsStarted) return;
    if (reducedMotion.matches || !('IntersectionObserver' in window) || document.hidden) {
      finishMetrics();
      return;
    }
    metricsStarted = true;
    metrics.forEach(({visual, finalText, target}) => {
      let frame = 0;
      const start = performance.now();
      const finish = () => {
        cancelAnimationFrame(frame);
        visual.textContent = finalText;
        activeCounters.delete(finish);
      };
      activeCounters.add(finish);
      const tick = now => {
        if (reducedMotion.matches || document.hidden) { finish(); return; }
        const progress = Math.max(0, Math.min((now - start) / 2800, 1));
        visual.textContent = `${Math.floor(target * Math.sin(progress * Math.PI / 2))}+`;
        if (progress < 1) frame = requestAnimationFrame(tick);
        else finish();
      };
      frame = requestAnimationFrame(tick);
    });
  }
  if (reducedMotion.matches || !('IntersectionObserver' in window)) finishMetrics();
  else {
    const metricsObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .45)) return;
      metricsObserver.disconnect();
      countMetrics();
    }, {threshold: .45});
    metricsObserver.observe(document.querySelector('.metrics-band'));
  }

  // Keep the stack active at every screen size. Tall cards scroll far enough to
  // expose their bottom before pinning, so neither text nor controls are clipped.
  const caseStack = document.querySelector('.case-studies');
  const caseCards = [...caseStack.querySelectorAll('.client-case')];
  let stackStep = 24;
  let stackEnabled = false;
  let stackTop = 0;
  let stackFrame = 0;
  let measureFrame = 0;
  caseCards.forEach((card, index) => card.style.setProperty('--stack-index', String(index)));

  function updateCaseStack() {
    stackFrame = 0;
    if (!stackEnabled) return;
    const bounds = caseCards.map(card => card.getBoundingClientRect());
    caseCards.forEach((card, index) => {
      let depth = 0;
      for (let next = index + 1; next < bounds.length; next++) {
        const distance = bounds[next].top - (stackTop + next * stackStep);
        depth += Math.max(0, Math.min(1, 1 - distance / card.offsetHeight));
      }
      card.style.setProperty('--stack-scale', (1 - depth * .035).toFixed(4));
      card.style.setProperty('--stack-shade', (depth * .06).toFixed(4));
    });
  }

  function measureCaseStack() {
    measureFrame = 0;
    stackEnabled = !reducedMotion.matches;
    caseStack.classList.toggle('case-stack-active', stackEnabled);
    // Remove the previous minimum before measuring actual layout, including the
    // single-column mobile layout, image sizes and user-enlarged text.
    caseStack.style.setProperty('--stack-card-height', '0px');
    const tallest = Math.ceil(Math.max(...caseCards.map(card => card.offsetHeight)));
    stackStep = mobileViewport.matches ? 14 : 24;
    const bottomSpace = mobileViewport.matches ? 104 : 32;
    stackTop = Math.min(headerShell.offsetHeight + 20,
      window.innerHeight - tallest - (caseCards.length - 1) * stackStep - bottomSpace);
    caseStack.style.setProperty('--stack-top', `${stackTop}px`);
    caseStack.style.setProperty('--stack-step', `${stackStep}px`);
    caseStack.style.setProperty('--stack-card-height', stackEnabled ? `${tallest}px` : '0px');
    caseCards.forEach(card => {
      card.style.removeProperty('--stack-scale');
      card.style.removeProperty('--stack-shade');
    });
    updateCaseStack();
  }
  function scheduleStackMeasure() {
    if (!measureFrame) measureFrame = requestAnimationFrame(measureCaseStack);
  }
  if ('ResizeObserver' in window) {
    const stackResize = new ResizeObserver(scheduleStackMeasure);
    stackResize.observe(headerShell);
    caseCards.forEach(card => {
      stackResize.observe(card.querySelector('.client-case-media'));
      stackResize.observe(card.querySelector('.client-case-copy'));
    });
  }
  document.fonts?.ready.then(scheduleStackMeasure);
  window.addEventListener('resize', scheduleStackMeasure, {passive: true});
  window.addEventListener('scroll', () => {
    if (stackEnabled && !stackFrame) stackFrame = requestAnimationFrame(updateCaseStack);
  }, {passive: true});
  measureCaseStack();

  // Conceal only registered entrances. Start at 72% of viewport height so an
  // entrance is visible, rather than finishing against the bottom edge.
  const entrances = new Map();
  let entranceObserver = null;
  function createEntranceObserver() {
    entranceObserver?.disconnect();
    if (!('IntersectionObserver' in window) || reducedMotion.matches) return;
    entranceObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const run = entrances.get(entry.target);
        if (!run) return;
        entranceObserver.unobserve(entry.target);
        entrances.delete(entry.target);
        entry.target.removeAttribute('data-entrance-pending');
        run();
      });
    }, {threshold: .01, rootMargin: `0px 0px -${Math.round(window.innerHeight * .28)}px 0px`});
    entrances.forEach((_, element) => entranceObserver.observe(element));
    root.classList.add('has-motion');
  }
  createEntranceObserver();
  let entranceResizeFrame = 0;
  window.addEventListener('resize', () => {
    if (!entranceResizeFrame) entranceResizeFrame = requestAnimationFrame(() => {
      entranceResizeFrame = 0;
      createEntranceObserver();
    });
  }, {passive: true});
  const watch = (element, run, conceal = true) => {
    if (!element) return;
    if (entranceObserver) {
      entrances.set(element, run);
      entranceObserver.observe(element);
      if (conceal) element.setAttribute('data-entrance-pending', '');
    }
    else element.classList.add('is-revealed');
  };
  const watchAll = (selector, delay = 0) => {
    document.querySelectorAll(selector).forEach((element, i) => watch(element, () => reveal(element, (i % 3) * delay)));
  };
  const benefits = document.querySelector('.principles--benefits');
  watch(benefits, () => {
    [...benefits.children].forEach((element, i) => reveal(element, i * 110, element.hasAttribute('aria-hidden') ? 'none' : 'content'));
  });
  watchAll('.solutions-heading, .clients-heading, .cases-heading, .about-copy, .additional-services-heading');
  watchAll('.solution-card', 150);
  document.querySelectorAll('.client-logo').forEach((element, i) => {
    watch(element, () => reveal(element, (i % (mobileViewport.matches ? 2 : 4)) * 120));
  });
  watchAll('.client-testimonial', 160);
  // Cases use only stack motion; metrics use their separate counting observer.
  watchAll('.about-commitments article', 120);
  watchAll('.additional-services-grid article', 130);
  watch(closing, () => {
    closing.classList.add('is-revealed');
  }, false);
  // Keyboard and anchor navigation should never arrive at an animating hidden control.
  const showTarget = target => {
    for (const animation of activeAnimations) {
      const element = animation.effect?.target;
      if (element && (element.contains(target) || target.contains(element))) animation.cancel();
    }
    for (const [element] of entrances) {
      if (element === target || element.contains(target) || target.contains(element)) {
        entranceObserver.unobserve(element);
        entrances.delete(element);
        element.removeAttribute('data-entrance-pending');
        element.classList.add('is-revealed');
      }
    }
  };
  document.addEventListener('focusin', event => showTarget(event.target));
  document.addEventListener('beforematch', event => showTarget(event.target));
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (target) showTarget(target);
  }));
  if (location.hash) {
    let anchor = location.hash.slice(1);
    try { anchor = decodeURIComponent(anchor); } catch { /* Keep malformed fragments inert. */ }
    const target = document.getElementById(anchor);
    if (target) showTarget(target);
  }

  // The supplied clip loops silently; the static artwork is only a fallback.
  const heroVideo = hero.querySelector('.hero-video');
  const heroImage = hero.querySelector('.hero-camera img');
  const heroVideoControl = hero.querySelector('.hero-video-control');
  let heroVideoUnavailable = false;
  let heroVideoPausedByUser = false;
  let heroPlayPending = false;
  const mayPlayHero = () => heroVisible && !document.hidden && !heroVideoPausedByUser && !reducedMotion.matches;

  function showHeroPoster() {
    if (heroVideoUnavailable) return;
    heroVideoUnavailable = true;
    heroVideo.pause();
    heroVideoControl.hidden = true;
    const restoreImage = () => heroVideo.classList.remove('is-visible');
    if (heroImage.complete && heroImage.naturalWidth) restoreImage();
    else heroImage.addEventListener('load', restoreImage, {once: true});
  }
  function updateHeroVideo() {
    if (heroVideoUnavailable) return;
    if (reducedMotion.matches || navigator.connection?.saveData) {
      showHeroPoster();
      return;
    }
    if (!mayPlayHero()) {
      heroVideo.pause();
      return;
    }
    if (heroPlayPending || !heroVideo.paused) return;
    if (!heroVideo.getAttribute('src')) {
      heroVideo.muted = true;
      heroVideo.src = heroVideo.dataset.src;
    }
    heroPlayPending = true;
    heroVideo.play().then(() => {
      heroPlayPending = false;
      if (heroVideoUnavailable || !mayPlayHero()) heroVideo.pause();
    }).catch(error => {
      heroPlayPending = false;
      // Pausing while a play request is pending is expected, not a media failure.
      if (error.name === 'AbortError') {
        if (mayPlayHero()) updateHeroVideo();
      } else showHeroPoster();
    });
  }
  heroVideo.addEventListener('playing', () => {
    if (heroVideoUnavailable || !mayPlayHero()) { heroVideo.pause(); return; }
    heroVideo.classList.add('is-visible');
    heroVideoControl.hidden = false;
  });
  heroVideo.addEventListener('error', showHeroPoster, {once: true});
  heroVideoControl.addEventListener('click', () => {
    heroVideoPausedByUser = !heroVideoPausedByUser;
    heroVideoControl.classList.toggle('is-paused', heroVideoPausedByUser);
    heroVideoControl.setAttribute('aria-label', heroVideoPausedByUser ? 'Retomar animação do fundo' : 'Pausar animação do fundo');
    heroVideoControl.title = heroVideoPausedByUser ? 'Retomar animação' : 'Pausar animação';
    updateHeroVideo();
  });
  const initialHeroBounds = hero.getBoundingClientRect();
  heroVisible = initialHeroBounds.bottom > headerShell.offsetHeight && initialHeroBounds.top < window.innerHeight;
  updateHeroVideo();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      updateHeroVideo();
      updateDock();
    }, {rootMargin: '-80px 0px 0px 0px'}).observe(hero);
    new IntersectionObserver(entries => {
      closingVisible = entries[0].isIntersecting;
      updateDock();
    }, {rootMargin: '0px 0px 88px 0px'}).observe(closing);
    const footerObserver = new IntersectionObserver(entries => {
      footerVisible = entries[0].isIntersecting;
      updateDock();
    }, {rootMargin: '0px 0px 88px 0px'});
    footerObserver.observe(document.querySelector('footer'));
  }
  let scrollFrame = 0;
  const updateHeader = () => {
    headerShell.classList.toggle('is-scrolled', window.scrollY > 24);
    scrollFrame = 0;
  };
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateHeader);
  }, {passive: true});
  updateHeader();
  document.addEventListener('visibilitychange', () => {
    updateHeroVideo();
    if (document.hidden) [...activeCounters].forEach(finish => finish());
  });
  reducedMotion.addEventListener('change', () => {
    measureCaseStack();
    if (!reducedMotion.matches) return;
    root.classList.remove('has-motion');
    [...activeAnimations].forEach(animation => animation.cancel());
    finishMetrics();
    entranceObserver?.disconnect();
    entrances.forEach((_, element) => element.removeAttribute('data-entrance-pending'));
    entrances.clear();
    showHeroPoster();
  });
})();
