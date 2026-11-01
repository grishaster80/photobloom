const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(new URL('../assets/analytics.js', `file://${__filename}`), 'utf8');

function page({ hostname = 'grishaster80.github.io', consent, dnt, gpc, storageBlocked = false } = {}) {
  const handlers = {};
  const storageHandlers = {};
  const scripts = [];
  const saved = new Map(consent ? [['photobloom.website.analytics', consent]] : []);
  const controls = new Map(['p', '[data-consent="yes"]', '[data-consent="no"]'].map(k => [k, {}]));
  const banner = { hidden: true, setAttribute() {}, querySelector: key => controls.get(key) };
  const window = { PHOTO_BLOOM_ANALYTICS: { token: 'phc_test', host: 'https://eu.i.posthog.com' }, addEventListener: (name, fn) => storageHandlers[name] = fn };
  const document = {
    documentElement: { dataset: {} },
    referrer: 'https://example.com/private/path?email=secret',
    createElement: tag => tag === 'aside' ? banner : {},
    head: { append: s => scripts.push(s) }, body: { append() {} },
    addEventListener: (name, fn) => handlers[name] = fn,
  };
  const location = { hostname, pathname: '/photobloom/', search: '?email=secret&utm_source=launch', href: `https://${hostname}/photobloom/` };
  const localStorage = {
    getItem: k => { if (storageBlocked) throw Error('blocked'); return saved.get(k); },
    setItem: (k, v) => { if (storageBlocked) throw Error('blocked'); saved.set(k, v); },
  };
  vm.runInNewContext(source, { window, document, location, navigator: { doNotTrack: dnt, globalPrivacyControl: gpc }, localStorage, URL, URLSearchParams });
  function choose(value) {
    handlers.click({ target: { closest: selector => selector.includes('data-consent') ? { dataset: { consent: value }, hasAttribute: () => false } : null } });
  }
  function clickDownload() {
    const link = { href: 'https://github.com/grishaster80/photobloom/releases/latest/download/photobloom.apk', dataset: { download: 'android_apk', placement: 'hero' } };
    handlers.click({ target: { closest: selector => selector === 'a[href]' ? link : null } });
  }
  return { window, scripts, banner, saved, choose, clickDownload, handlers, storageHandlers };
}

test('no network or identity until consent; one pageview on opt-in', () => {
  const p = page();
  assert.equal(p.scripts.length, 0);
  assert.equal(p.window.posthog, undefined);
  assert.equal(p.banner.hidden, false);
  p.choose('yes');
  assert.equal(p.scripts.length, 1);
  assert.equal(p.banner.hidden, true);
  assert.equal(p.window.posthog.filter(e => e[1] === '$pageview').length, 1);
  p.choose('yes');
  assert.equal(p.scripts.length, 1);
  assert.equal(p.window.posthog.filter(e => e[1] === '$pageview').length, 1);
});

test('download capture is immediate, classified, and never blocks navigation', () => {
  const p = page({ consent: 'yes' });
  p.clickDownload();
  const event = p.window.posthog.at(-1);
  assert.equal(event[1], 'website_download_clicked');
  assert.equal(event[2].link_destination, 'android_apk');
  assert.equal(event[2].placement, 'hero');
  assert.equal(event[2].environment, 'release');
  assert.equal(event[2].referrer_host, 'example.com');
  assert.equal(event[2].utm_source, 'launch');
  assert.equal(event[2].email, undefined);
  assert.equal(event[3].transport, 'sendBeacon');
  assert.equal(event[3].send_instantly, true);
  p.window.posthog.capture = () => { throw Error('blocked'); };
  assert.doesNotThrow(() => p.clickDownload());
});

test('decline and browser privacy signals never load the SDK', () => {
  for (const options of [{ consent: 'no' }, { dnt: '1', consent: 'yes' }, { gpc: true, consent: 'yes' }]) {
    const p = page(options);
    assert.equal(p.scripts.length, 0);
    p.choose('yes');
    if (options.dnt || options.gpc) assert.equal(p.scripts.length, 0);
  }
  const p = page(); p.choose('no');
  assert.equal(p.scripts.length, 0);
});

test('withdrawal drops queued sends; later opt-in recovers an opted-out SDK', () => {
  const p = page({ consent: 'yes' });
  const config = p.window.posthog._i[0][1];
  const sdk = p.window.posthog;
  let optedOut = false;
  sdk.__loaded = true;
  sdk.reset = () => {};
  sdk.opt_out_capturing = () => { optedOut = true; };
  sdk.has_opted_out_capturing = () => optedOut;
  sdk.opt_in_capturing = () => { optedOut = false; };
  p.choose('no');
  assert.equal(optedOut, true);
  assert.equal(config.before_send({ properties: {} }), null);
  const previous = sdk.length;
  p.clickDownload(); assert.equal(sdk.length, previous);
  p.choose('yes'); assert.equal(optedOut, false);
  p.clickDownload(); assert.equal(sdk.at(-1)[1], 'website_download_clicked');
  p.storageHandlers.storage({ key: 'photobloom.website.analytics', newValue: 'no' });
  assert.equal(config.before_send({ properties: {} }), null);
});

test('sensitive URL details are stripped; development and blocked storage are safe', () => {
  const p = page({ consent: 'yes' });
  const config = p.window.posthog._i[0][1];
  const result = config.before_send({ properties: { $current_url: 'https://example.org/a?email=secret#private', $referrer: 'https://referrer.org/private?q=secret' } });
  assert.equal(result.properties.$current_url, 'https://example.org/a');
  assert.equal(result.properties.$referrer, 'https://referrer.org');
  assert.equal(config.autocapture, false);
  assert.equal(config.disable_session_recording, true);
  assert.equal(config.person_profiles, 'never');
  const local = page({ hostname: 'localhost', consent: 'yes' });
  assert.equal(local.scripts.length, 0);
  const blocked = page({ storageBlocked: true });
  assert.doesNotThrow(() => blocked.choose('yes'));
  assert.equal(blocked.scripts.length, 1);
});
