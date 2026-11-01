(() => {
  'use strict';

  const config = window.PHOTO_BLOOM_ANALYTICS;
  if (!config?.token) return;
  const production = location.hostname === 'grishaster80.github.io';
  // Explicit QA opt-in keeps local previews out of production reports.
  const testing = new URLSearchParams(location.search).get('analytics_test') === '1';
  if (!production && !testing) return;

  const consentKey = 'photobloom.website.analytics';
  const privacySignal = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  let consent;
  try { consent = localStorage.getItem(consentKey); } catch { /* Storage may be blocked. */ }
  let started = false;
  let pageviewSent = false;
  const allowed = () => consent === 'yes' && !privacySignal();
  const cleanURL = (value) => {
    try { const url = new URL(value); return url.origin + url.pathname; } catch { return ''; }
  };
  const properties = {
    surface: 'website',
    platform: 'web',
    environment: testing ? 'test' : 'release',
    page_path: location.pathname,
  };
  const query = new URLSearchParams(location.search);
  for (const name of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = query.get(name);
    if (value) properties[name] = value.slice(0, 100);
  }
  if (document.referrer) {
    try { properties.referrer_host = new URL(document.referrer).hostname; } catch { /* Ignore invalid referrers. */ }
  }

  function capture(event, extra = {}) {
    if (!allowed() || !started) return;
    try {
      window.posthog.capture(event, { ...properties, ...extra }, {
        transport: 'sendBeacon', send_instantly: true,
      });
    } catch { /* Analytics must never interfere with navigation or downloads. */ }
  }

  function start() {
    if (!allowed()) return;
    if (started && window.posthog.__loaded && window.posthog.has_opted_out_capturing()) {
      window.posthog.opt_in_capturing({ captureEventName: false });
    }
    if (!started) {
      started = true;
      if (testing) document.documentElement.dataset.analyticsState = 'loading';
      // Small SDK queue: events wait here while the official async bundle loads.
      const queue = window.posthog = [];
      queue.__SV = 1;
      queue._i = [[config.token, {
        api_host: config.host,
        ui_host: 'https://eu.posthog.com',
        persistence: 'localStorage',
        persistence_name: 'photobloom_website',
        cross_subdomain_cookie: false,
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        enable_heatmaps: false,
        advanced_disable_flags: true,
        respect_dnt: true,
        ip: false,
        request_batching: false,
        save_campaign_params: false,
        save_referrer: false,
        loaded(client) {
          if (testing) document.documentElement.dataset.analyticsState = allowed() ? 'ready' : 'disabled';
          if (allowed()) client.opt_in_capturing({ captureEventName: false });
          else { pageviewSent = false; client.reset(); client.opt_out_capturing(); }
        },
        before_send(event) {
          if (!allowed()) return null;
          // Do not send arbitrary query strings, fragments or referring paths.
          for (const field of ['$current_url', '$initial_current_url']) {
            if (event.properties[field]) event.properties[field] = cleanURL(event.properties[field]);
          }
          for (const field of ['$referrer', '$initial_referrer']) {
            if (event.properties[field]) {
              try { event.properties[field] = new URL(event.properties[field]).origin; }
              catch { delete event.properties[field]; }
            }
          }
          return event;
        },
      }, 'posthog']];
      queue.capture = (...args) => queue.push(['capture', ...args]);
      const script = document.createElement('script');
      script.async = true;
      script.onerror = () => {
        if (testing) document.documentElement.dataset.analyticsState = 'unavailable';
      };
      script.crossOrigin = 'anonymous';
      script.src = config.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
      document.head.append(script);
    }
    if (!pageviewSent) {
      pageviewSent = true;
      capture('$pageview');
      capture('website_page_viewed');
    }
  }

  const choice = document.createElement('aside');
  choice.className = 'analytics-choice';
  choice.setAttribute('aria-label', 'Website analytics preferences');
  choice.hidden = true;
  choice.innerHTML = '<p>Help improve PhotoBloom with anonymous visit and download-click counts? Your photos are never collected. <a href="privacy.html#website-analytics">About analytics</a></p><div class="actions"><button type="button" class="allow" data-consent="yes">Allow analytics</button><button type="button" class="link-button" data-consent="no">No thanks</button></div>';
  document.body.append(choice);

  function showPreferences() {
    choice.hidden = false;
    if (privacySignal()) {
      choice.querySelector('p').textContent = 'Analytics is disabled because your browser sends Do Not Track or Global Privacy Control.';
      choice.querySelector('[data-consent="yes"]').hidden = true;
      choice.querySelector('[data-consent="no"]').textContent = 'Close';
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-analytics-preferences], [data-consent]');
    if (button) {
      if (button.hasAttribute('data-analytics-preferences')) {
        showPreferences();
      } else {
        consent = button.dataset.consent;
        try { localStorage.setItem(consentKey, consent); } catch { /* Keep the choice for this page. */ }
        choice.hidden = true;
        if (allowed()) start();
        else if (started && window.posthog.__loaded) {
          pageviewSent = false;
          // Remove the anonymous identity too when permission is withdrawn.
          window.posthog.reset();
          window.posthog.opt_out_capturing();
        }
      }
      return;
    }
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    const destination = link.dataset.download;
    const extra = {
      link_destination: destination || (url.protocol === 'mailto:' ? 'contact' : cleanURL(url.href)),
      placement: link.dataset.placement || (link.closest('footer') ? 'footer' : link.closest('nav') ? 'nav' : 'content'),
    };
    capture(destination ? 'website_download_clicked' : 'website_link_clicked', extra);
  });
  // Track middle-clicks that open a new tab, without double-counting primary clicks.
  document.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const link = event.target.closest('a[data-download]');
    if (link) capture('website_download_clicked', { link_destination: link.dataset.download, placement: link.dataset.placement || 'content' });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== consentKey) return;
    consent = event.newValue;
    if (allowed()) start();
    else {
      pageviewSent = false;
      if (started && window.posthog.__loaded) {
        window.posthog.reset();
        window.posthog.opt_out_capturing();
      }
    }
  });

  if (!consent && !privacySignal()) showPreferences();
  start();
})();
