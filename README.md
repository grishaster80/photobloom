# PhotoBloom website

Marketing, support and privacy pages for PhotoBloom on iPhone, iPad and Android.
Live at https://grishaster80.github.io/photobloom/ via GitHub Pages, `main`, repository root.
Plain static HTML/CSS/JavaScript, no build step. Asset references include a content-hash
query string; update it on all three pages when changing an asset to avoid stale browser caches.

## Downloads

- App Store: https://apps.apple.com/app/id6775195550
- Android APK: https://github.com/grishaster80/photobloom/releases/latest/download/photobloom.apk
- Release notes and checksums: https://github.com/grishaster80/photobloom/releases/latest

Publish future Android releases in this repository with the same `photobloom.apk` asset name,
mark them Latest, and keep the same signing key so installed APKs can update in place.
A Google Play build can have a different app-signing certificate. Do not promise migration
from sideloaded builds without checking certificate compatibility.

The Android app source is in the separate `grishaster80/photo-bloom` repository under `android/`.
Build with the locally provisioned release keystore using `./gradlew :app:assembleRelease`.
Verify with Android SDK `apksigner verify --verbose --print-certs`, publish the signed APK
and its SHA-256 checksum, and test the download before changing the website.
Never upload a debug or unsigned APK, keystore, local.properties, or admin token.

## Analytics

`assets/analytics-config.js` contains the **public ingestion token**, shared with the native
PhotoBloom apps in PostHog EU. It is intended to be public, and cannot read dashboards or
manage the project. No personal/admin API key belongs in this repository.

Analytics starts only after a visitor selects Allow analytics. No thanks and browser
Do Not Track/Global Privacy Control disable collection. Visitors can change their choice
in the footer. Anonymous browser identity uses localStorage; cookies, autocapture,
session replay, person profiles and surveys are disabled. Arbitrary URL queries/fragments
and referring paths are stripped; only utm_source/medium/campaign labels are retained.
As with other browser analytics, reports exclude people who decline or block tracking.
Unique browsers are estimates, not identified people; clearing storage or changing devices
creates a new anonymous visitor.

All website events include `surface=website`, `platform=web`, `environment=release`, and
`page_path`. Keep `environment=test` out of production insights. Mobile events remain separate.

| Event | Meaning / useful breakdowns |
| --- | --- |
| `$pageview` | Standard PostHog web analytics page view and visitor counts |
| `website_page_viewed` | Explicit page view; unique users = consenting anonymous browsers |
| `website_download_clicked` | `link_destination`: `app_store` or `android_apk`; `placement`: `hero`, `download`, or `support` |
| `website_link_clicked` | Navigation, privacy/support, release-notes and contact links; `link_destination` is a sanitized URL or `contact` |

In [PostHog EU](https://eu.posthog.com), open the existing PhotoBloom project:

1. **Web analytics**: filter hostname `grishaster80.github.io` and page paths beginning `/photobloom/`.
2. **Product analytics → Insights**: filter `surface=website`, `environment=release` for all charts.
3. Make a trend for `website_page_viewed`: total count for page views, unique users for visitors.
4. Make a trend for `website_download_clicked`, broken down by `link_destination`, then `placement`.
5. Make a funnel `website_page_viewed → website_download_clicked` to measure visit-to-click conversion.

Click counts show download intent. They do **not** prove a completed download or app install,
and website/browser identities are not automatically linked to native installations.
GitHub release asset download counts provide a separate coarse check on APK downloads.
The PostHog dashboard requires the owner's sign-in; website ingestion does not.

## Preview / verification

```sh
python3 -m http.server 8765
node --check assets/analytics.js
node --test tests/analytics.test.cjs
```

Local previews never send analytics by default. Add `?analytics_test=1`, then allow analytics,
for explicit browser QA against PostHog; these events use `environment=test`. Check that
page and link events are accepted and that decline/withdrawal stops requests. Download links
must keep working even if PostHog is blocked or the SDK fails to load.

Contact: gshimichev@gmail.com
