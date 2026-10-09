# Client-side security hardening for SYNAPSE (Capacitor 8 Android WebView + PWA), as of October 2026

Research notes. Primary sources: Capacitor docs and Android runtime source (read from the `ionic-team/capacitor-docs` and `ionic-team/capacitor` GitHub repos, because capacitorjs.com did not resolve from this environment), MDN content (from the `mdn/content` repo, because developer.mozilla.org did not resolve), OWASP Cheat Sheet Series (from the `OWASP/CheatSheetSeries` repo), developer.android.com, and the GitHub Advisory Database. docs.github.com was also unreachable (DNS failure and HTTP 403), so the GitHub-feature claims below rely on search-result summaries of docs.github.com pages and are flagged as such.

Facts checked in the repo during this research (for the report writer):
- `@capacitor/android`/`@capacitor/core` 8.5.2. `targetSdkVersion = 36`, `minSdkVersion = 24` (`android/variables.gradle`).
- `index.html` loads only same-origin resources: `src/styles/*.css` and `src/boot.js` as `type="module"`, with no inline `<script>`. Fonts are self-hosted woff2 (`src/styles/fonts.css`).
- Inline `style="..."` attributes appear in about 25 HTML template strings set with innerHTML (e.g. `src/components/logo.js:71-76`, `src/components/demos.js:35`). There are also many `el.style.x = ...` CSSOM assignments.
- `src/components/logo.js:175` builds `blob:` URLs with `URL.createObjectURL` and uses them in `style.maskImage = url(blob:...)`.
- No `eval`/`new Function` in `src/`.
- `AndroidManifest.xml`: one exported activity (MainActivity) with only the MAIN/LAUNCHER intent filter, so there are no deep links. `android:allowBackup="true"` and no `dataExtractionRules`. Permissions are INTERNET and VIBRATE only.
- `.gitignore` ignores `*.keystore` except `android/app/debug.keystore`, and `git ls-files` confirms only the debug keystore is tracked. The release keystore comes from GitHub Secrets in `.github/workflows/android.yml`. There is no `.github/dependabot.yml`.
- The README plans to host the PWA and the privacy policy on GitHub Pages (`https://<user>.github.io/SYNAPSE/`). The repo is `github.com/darkhyper93-jpg/SYNAPSE`.
- `uuid@7.0.3` comes only through `@capacitor/cli@8.5.2 -> xcode@3.0.1 -> uuid`, and `@capacitor/cli` is a devDependency.

---

## Q1. How to write a CSP for Capacitor 8 Android plus the PWA; meta vs headers; which headers matter for a static PWA

### Takeaway
A `<meta http-equiv="Content-Security-Policy">` tag is the mechanism Capacitor itself documents, and it is the only option on GitHub Pages. It gives nearly full XSS protection. It cannot set `frame-ancestors`, `sandbox` or reporting, and the other security headers (nosniff, Referrer-Policy, Permissions-Policy, HSTS) cannot be set by meta at all. For SYNAPSE, an allowlist CSP built on `'self'` works unchanged in both the Android WebView (`https://localhost`) and the PWA (`https://<user>.github.io`). Two app-specific needs must be allowed: inline style attributes (`style-src-attr 'unsafe-inline'` or `style-src 'unsafe-inline'`) and `blob:` images. Header-only protections such as clickjacking protection need a host with header control (Netlify or Cloudflare Pages `_headers`). They are low value for an offline game with no accounts, so they are optional.

### Cited Findings
- Capacitor's security guide recommends CSP through a meta tag. Quote: "CSP can be configured in your Capacitor app by adding a `meta` tag to the `<head>` … (CSP can be configured both server and client side using the same format)". Its example is `default-src 'self' foo.com`. — [Capacitor Security guide (source)](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/guides/security.md) / [capacitorjs.com/docs/guides/security](https://capacitorjs.com/docs/guides/security)
- On Android the app is served from `androidScheme` (default `https`) and `hostname` (default `localhost`), so the origin is `https://localhost`. The config docs warn that custom (non-http/https) schemes break routing as of WebView 117. `iosScheme` defaults to `capacitor`, which makes `capacitor://localhost` an iOS-only origin and irrelevant to an Android-only build. — [Capacitor config reference (source)](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/reference/config.md)
- Since Capacitor 6, `https` has been the default `androidScheme` for existing apps too. Changing the scheme "is the equivalent to shipping your application on a different domain", which means localStorage and other stored data would be lost. — [Capacitor 6 upgrade guide (source)](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/updating/6-0.md)
- Capacitor 8.x Android injects its JS bridge (`native-bridge.js`) with `WebViewCompat.addDocumentStartJavaScript(webView, script, {appOrigin})` when the WebView supports `DOCUMENT_START_SCRIPT`. Only when that feature is missing does it fall back to `JSInjector`, which rewrites the HTML response to insert an inline `<script type="text/javascript">…</script>`. — [Bridge.java loadWebView()](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java); [JSInjector.java](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/JSInjector.java); [WebViewLocalServer.getJavaScriptInjectedStream](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java)
- With `server.resolveServiceWorkerRequests` (since 7.0.0, default `true`), Capacitor routes service-worker fetches through its local server through `ServiceWorkerController`. — [config reference](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/reference/config.md); [Bridge.java](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java)
- OWASP: with a meta CSP, "Almost everything is still supported, including full XSS defenses. However, you will not be able to use framing protections, sandboxing, or a CSP violation logging endpoint." — [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- MDN: `frame-ancestors` "is not supported in the `<meta>` element", and when it is not set, framing is allowed. — [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
- MDN warns about meta: "**Do not set other security headers** using `<meta http-equiv=`, as this can lead to a false sense of security!" — [MDN meta http-equiv](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv)
- MDN: multiple policies can only further restrict, never relax. A meta CSP added later to a site that also sends header CSP cannot loosen it. — [MDN Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- MDN: `worker-src` falls back to `child-src`, then `script-src`, then `default-src`, so `'self'` covers a same-origin `sw.js`. The worker-CSP section says a worker is governed by the CSP of its own script response, not the creating document's, except for `data:`/`blob:` workers, which inherit it. — [MDN worker-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src); [MDN CSP (workers section)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- MDN: `style-src-attr` "specifies valid sources for inline styles applied to individual DOM elements". It falls back to `style-src` and then `default-src`, and it does not cover `<style>`/`<link>` elements. — [MDN style-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr)
- MDN: `img-src` "specifies valid sources of images and favicons" and falls back to `default-src`. — [MDN img-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src)
- OWASP recommends a "Strict" CSP based on nonces or hashes as current leading practice. Nonces need per-response server templating ("using nonces requires a non-static HTML"), which a static site does not have. — [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- OWASP HTTP Headers Cheat Sheet recommendations:
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`, set explicitly even though it is the modern browser default.
  - `Permissions-Policy` that disables unused features (e.g. `geolocation=(), camera=(), microphone=()`), so that an XSS cannot turn them on.
  - `frame-ancestors` over `X-Frame-Options: DENY`.
  - `X-XSS-Protection: 0` or not set at all.
  - HSTS `max-age=63072000; includeSubDomains; preload`, read carefully first, because misconfiguration can lock users out.
  - Source: [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- GitHub Pages does not let sites set custom response headers, so CSP must go in a meta tag there. Netlify and Cloudflare Pages support a `_headers` file. This comes from third-party sources, not GitHub's own docs. — [htmhell: Security Headers using meta](https://htmhell.dev/adventcalendar/2023/7/); [Cloudflare Pages headers docs](https://developers.cloudflare.com/pages/platform/headers/)

### Inferences
**Proposed policy.** This policy matches the code as verified above. It should go as the first element after `<meta charset>` in `index.html`, so that it applies before any `<link>`/`<script>`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self';
  style-src-attr 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  worker-src 'self';
  manifest-src 'self';
  object-src 'none';
  base-uri 'none';
  form-action 'none'">
```
- `'self'` resolves to `https://localhost` in the APK and to `https://<user>.github.io` on the PWA, so one policy fits both. `capacitor://localhost` is iOS-only and is not needed.
- `style-src-attr 'unsafe-inline'` is required by the inline `style="--i:…"` attributes in innerHTML templates (logo.js, demos.js). Using it instead of `style-src 'unsafe-inline'` keeps `<style>` elements locked down. The fallback is to use `style-src 'self' 'unsafe-inline'` if older WebViews (minSdk 24) misbehave. CSSOM assignments (`el.style.foo = …`, `setProperty`) are not blocked by `style-src`; this is general knowledge, not verified in a fetched source, so test it.
- `blob:` in `img-src` is needed because logo.js puts `blob:` URLs into `mask-image`. It is an inference that CSS mask images are checked against `img-src`; verify in DevTools that the logo "flow" effect still works. `data:` is included only defensively and can be dropped if testing shows no `data:` images.
- No `'unsafe-eval'` is needed because the code has no eval or `new Function`.
- `frame-ancestors`, `report-to` and `sandbox` are silently ignored in meta, so leave them out.
- `form-action 'none'` and `base-uri 'none'` are free hardening because the app has no forms or `<base>`. If a future feature adds a form, it would need `form-action 'self'`.

**Plugin and service-worker pitfalls:**
- The Capacitor bridge on modern WebViews is injected through `addDocumentStartJavaScript`. I found no primary source that says whether page CSP applies to such scripts. In practice, Capacitor apps commonly ship `script-src 'self'` policies (see Gaps).
- The real risk is the `JSInjector` fallback: on a WebView without `DOCUMENT_START_SCRIPT` (very old, un-updated WebView), the inline `<script>` would be blocked by `script-src 'self'`, and every plugin call (App, Haptics, SplashScreen, SystemBars) would fail. Mitigation is to test on the oldest target device or emulator image. If that WebView is still in scope, `'unsafe-inline'` for scripts would be the price, which is not recommended. Raising `minSdkVersion` or accepting the risk is more proportionate.
- Capacitor plugin calls go through the native message bridge, not `fetch`, so `connect-src 'self'` should not break them. This is an inference from the bridge design, not stated in the docs.
- The service worker's own fetches (precache, network-first) are not governed by the page's meta CSP, so the CSP will not break offline caching. Registration of a same-origin `sw.js` is allowed by `worker-src 'self'`.
- Settings links: if `src/components/screens/settings.js` opens external `https://` links (e.g. the privacy policy URL), plain navigations are not restricted by CSP fetch directives. Capacitor sends non-app hosts to the system browser.

**Meta vs headers for the PWA.** For SYNAPSE (no login, no secrets, no cross-origin data), clickjacking via `frame-ancestors` has almost nothing to steal or trigger, and the other headers are nice-to-have. Meta CSP on GitHub Pages is proportionate.

**If the PWA is ever moved to Netlify or Cloudflare Pages**, a `_headers` file with the following would be cheap extra hardening:
- `Content-Security-Policy` (the same policy plus `frame-ancestors 'none'`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer`)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), …`

HSTS only matters for a custom domain. `*.github.io` is already HTTPS-only (see Gaps).

**Referrer.** A `<meta name="referrer" content="no-referrer">` (or `strict-origin-when-cross-origin`) is a legitimate in-page alternative to the Referrer-Policy header (MDN lists `meta name="referrer"` as the in-page mechanism). It is harmless to add.

**Force HTTPS.** This is already covered on both platforms:
- APK: `androidScheme` https, `allowMixedContent=false`, and Android blocks cleartext by default from API 28.
- PWA: github.io serves HTTPS, and service workers require a secure context anyway.

The only action is to keep `server.url`, `server.cleartext` and `allowMixedContent` out of the production config. All three are documented as "not intended for use in production".

### Gaps
- No primary source confirms whether CSP from a meta tag applies to scripts injected with `WebViewCompat.addDocumentStartJavaScript`. I believe it does not block them, because they are injected by the embedder rather than parsed from the document, but this was not verified. It should be tested on-device: plugin calls must still work with the CSP in place.
- I could not determine the minimum WebView/Chromium version that supports `DOCUMENT_START_SCRIPT`, which is the condition under which the inline-script fallback would trigger.
- docs.github.com was unreachable, so I could not quote GitHub's own statement that `*.github.io` sites enforce HTTPS automatically or that custom headers are unsupported. These are widely reported but taken here from third-party sources.
- I did not find a primary source that explicitly states which CSP directive governs CSS `mask-image` URLs.

---

## Q2. Capacitor Android security defaults in v7/v8, and what the Capacitor security guide still asks of a no-backend app

### Takeaway
SYNAPSE's Android configuration already matches secure defaults:
- `androidScheme` https
- mixed content off
- WebView debugging off in release
- no `server.url`/`cleartext`/`allowNavigation`
- the modern `addWebMessageListener` bridge (`useLegacyBridge` false)
- file access off by default for targetSdk ≥ 30
- the only exported activity is the launcher, with no deep links

Of the Capacitor guide's four areas (data, auth/deep links, network, WebView), the only items that apply to a no-backend game are "no secrets in code" (already satisfied) and CSP (Q1). Two optional extras: set `loggingBehavior` explicitly and decide `allowBackup` deliberately.

### Cited Findings
- Defaults from the Capacitor config reference:
  - `android.allowMixedContent`: default `false`, "disabled by default for security … **This is not intended for use in production.**"
  - `android.webContentsDebuggingEnabled`: default `false`, "automatically enabled during development".
  - `server.cleartext`: default `false`, "On Android, all cleartext traffic is disabled by default as of API 28 … not intended for use in production".
  - `server.allowNavigation`: default `[]`, "By default, all external URLs are opened in the external browser … not intended for use in production".
  - `server.url`: "not intended for use in production".
  - Source: [Capacitor config reference (source)](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/reference/config.md)
- `useLegacyBridge` (since 4.5.0, default `false`): Capacitor uses "the new and more secure `addWebMessageListener`" instead of `addJavascriptInterface`. — [config reference](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/reference/config.md)
- `loggingBehavior` (default `debug`): native and redirected JS console logs "can leak information on device if enabled in released builds". `'debug'` means logs are produced in debug builds only. — [config reference](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/reference/config.md)
- What the Capacitor 8 runtime does:
  - It registers the bridge only for allowed origins: the app's `scheme://host`, plus `server.url` and `allowNavigation` entries if set.
  - It sends any navigation to a host other than the app host, or one not in `allowNavigation`, to an external `Intent.ACTION_VIEW`.
  - It sets `setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)` only if `allowMixedContent` is true.
  - It calls `WebView.setWebContentsDebuggingEnabled(config.isWebContentsDebuggingEnabled())`.
  - It does not call `setAllowFileAccess`, so the platform default applies.
  - Source: [Bridge.java](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java)
- Android `WebSettings.setAllowFileAccess`: "The default value is true for apps targeting Build.VERSION_CODES.Q and below, and false when targeting Build.VERSION_CODES.R and above". The page also says: "It's recommended to always use androidx.webkit.WebViewAssetLoader to access files … over http(s):// schemes, instead of file:// URLs". `setAllowFileAccessFromFileURLs` and `setAllowUniversalAccessFromFileURLs` are deprecated as "not secure". — [Android WebSettings reference](https://developer.android.com/reference/android/webkit/WebSettings)
- Android's WebView native-bridge guidance:
  - `addJavascriptInterface` "injects a supplied Java object into every frame … no mechanism … to verify the origin".
  - Message channels should use explicit origins, never `*`.
  - "only load strictly scoped URLs and content owned by the app developer into WebView".
  - Allowlist hosts and open others in the default browser.
  - Enforce HTTPS with `usesCleartextTraffic="false"` or a network security config.
  - Source: [Android: Insecure WebView native bridges](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)
- Capacitor security guide sections:
  - Data: "never embed secrets" and keep tokens in memory or in Keystore/Keychain.
  - Auth/Deep links: custom URL schemes can be hijacked, so never send sensitive data through them; use App Links and PKCE for OAuth.
  - Network: only `https://` endpoints.
  - WebView: CSP and general JS security.
  - Source: [Capacitor Security guide (source)](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/guides/security.md)
- Android Auto Backup: apps targeting API 23+ participate automatically, and `allowBackup` defaults to true. The page recommends setting it explicitly. `dataExtractionRules` (Android 12+) and `fullBackupContent` (Android 11 and lower) can exclude files. — [Android: Back up user data with Auto Backup](https://developer.android.com/identity/data/autobackup); [Android: backup leaks risk](https://developer.android.com/privacy-and-security/risks/backup-leaks)

### Inferences
- **Exported MainActivity.** It is exported only because it carries the LAUNCHER intent filter, which Android 12+ requires to be declared explicitly. There are no custom-scheme or App Link intent filters, so no deep-link attack surface exists. **Action:** none. Keep it this way, and if deep links are ever added, use verified App Links and never pass sensitive data through them.
- **Debugging and logging.** `webContentsDebuggingEnabled: false` is already the default. Keeping it explicit is fine. Optionally add top-level `"loggingBehavior": "debug"` (or `"none"`) to make the release behaviour explicit. Since there is no sensitive data, this matters little.
- **File access.** With `targetSdkVersion = 36`, WebView file access is off by default, and Capacitor serves assets over `https://localhost` (the same model as WebViewAssetLoader). **Action:** none. "Restrict files" in the generic list is already satisfied on Android.
- **Restrict files on the PWA host.** The equivalent concern on the PWA is that GitHub Pages "Deploy from branch, root" publishes the whole repo:
  - What gets exposed: `tests/`, `scripts/`, `reports/`, `research_notes/`, `store/`, `android/` and `android/app/debug.keystore`.
  - None of this is secret, but it is unnecessary exposure.
  - **Low-risk step:** publish only the built `www/` folder (GitHub Actions Pages deployment or a `gh-pages` branch) instead of the repo root. This also prevents future accidental exposure if something sensitive is ever committed.
  - Caveat: if the repo is public, the files are already public on github.com, so the gain is mostly hygiene.
- **allowBackup.**
  - With `allowBackup="true"`, WebView localStorage/IndexedDB (game progress) is included in Google cloud backup and device transfer. For a game this is arguably a feature: progress survives a phone change.
  - This rests on the belief that WebView storage lives in the app data dir and is therefore backed up. That is not verified in a primary source; see Gaps.
  - The privacy policy and the Play Data safety form should be consistent with this. Whether Google backup needs to be declared is a question for the Play-policy researcher.
  - Setting `allowBackup="false"` would only make sense if progress were sensitive, and it is not.
  - **Recommendation:** keep `true`, but state it consciously.
- **No backend.** "Hide API keys" and "Validate inputs" (server-side) do not apply. There are no keys, no endpoints and no free-text input. Client-side validation of stored data on load (robust parsing of localStorage/IndexedDB values with defaults on corruption) is a robustness concern, not a security one. It protects against crashes from corrupted or tampered saves.

### Gaps
- I did not find an official Capacitor 8 "security checklist" beyond the security guide and the config reference. The guide in the docs repo is old and generic (contributor mlynch), and it does not mention v7/v8 changes.
- I found no primary source stating how WebView localStorage/IndexedDB interacts with Auto Backup rules. The OWASP MASTG demos show WebView localStorage as stored app data, but not its backup behaviour.

---

## Q3. Is innerHTML with internally generated strings a real XSS risk? When would DOMPurify or Trusted Types be needed?

### Takeaway
No. XSS requires attacker-controlled data reaching an HTML sink. With no user input, no network data, no URL parameters rendered and no third-party scripts, SYNAPSE's innerHTML of i18n strings and generated symbols is not an exploitable XSS vector. Sanitization becomes necessary when any value that did not come from the app's own code reaches innerHTML. Examples: a player-entered name, a remotely fetched config, translations or leaderboard, URL query/hash values, or anything read back from storage that someone else could write. The proportionate step now is CSP (which blocks injected inline scripts anyway) plus a coding rule: prefer `textContent` for text, and keep innerHTML for static templates. DOMPurify and Trusted Types are overkill today.

### Cited Findings
- MDN Trusted Types: DOM-based XSS happens "when data crafted by an attacker is passed to a browser API that executes that data as code". `innerHTML` is an HTML injection sink. A Trusted Types policy typically sanitizes with DOMPurify, and the API "does not itself supply a policy". Enforcement is through CSP directives (`require-trusted-types-for`, `trusted-types`). — [MDN Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API)
- OWASP: "When displaying text with JavaScript, assign it to the `textContent` property … This creates a text node without parsing HTML". OWASP recommends DOMPurify for HTML sanitization and warns "You must regularly patch DOMPurify … bypasses are being discovered regularly." — [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- OWASP on styles: "use a fixed property such as `element.style.color` with a value from an application-defined allowlist … Do not let untrusted input choose the property". — [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- OWASP's "perfect injection resistance" applies to "all variables". The threat model is untrusted variables reaching sinks. — [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html); [OWASP DOM-based XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html)
- Android's guidance names "Reflecting untrusted content in a bridge-enabled WebView" as the XSS route to native bridges. That is why XSS would matter more in a Capacitor app (plugin access) than on a plain site. — [Android: Insecure WebView native bridges](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)

### Inferences
- **Storage data.** In SYNAPSE the only data not hard-coded is what the app reads back from localStorage/IndexedDB.
  - On Android, only the app itself (or a rooted device or ADB backup restore) can write there.
  - On the PWA, only same-origin scripts can.
  - Tampering is therefore self-inflicted, e.g. a player cheating their own score, and it is not a cross-user attack.
  - If any stored value (e.g. a stored name, label or language string) is ever interpolated into innerHTML, treat it as untrusted: use textContent, or coerce numbers with `Number()` before interpolation.
  - Worth a quick grep before launch: confirm that no stored string is interpolated into an HTML template. Numbers are safe after coercion.
- **GitHub Pages origin sharing.** `<user>.github.io/SYNAPSE` shares its origin (`https://<user>.github.io`) with every other project page of the same GitHub user. Any other repo of that user published to Pages could read or write SYNAPSE's localStorage/IndexedDB and register competing service workers within its path scope. This is the one realistic "other code on my origin" scenario.
  - Mitigation if the user ever hosts untrusted or other content: use a dedicated domain or subdomain.
  - Not urgent for a single-project account. This is my analysis based on the standard same-origin model, not a cited source.
- **When to adopt DOMPurify or Trusted Types** (any one of these is enough):
  - any free-text input (player name, custom deck)
  - remote content (downloadable challenge packs, remote i18n, leaderboards)
  - rendering URL params or `postMessage` data
  - embedding third-party SDKs (ads, analytics) that widen the attack surface
  - At that point, also consider `require-trusted-types-for 'script'` in CSP. Note this would also flag the app's own innerHTML calls, so it requires refactoring to a policy.

### Gaps
- I did not verify cross-browser support status of Trusted Types as of 2026 (Firefox/Safari shipping status). It is not needed for the current recommendation.

---

## Q4. Is the dev-only uuid advisory relevant? Recommended dependency and secret scanning setup

### Takeaway
GHSA-w5hq-g745-h8pq (CVE-2026-41907) is not relevant to the shipped app. It lives only in the CLI toolchain (`@capacitor/cli -> xcode -> uuid@7.0.3`), which is a devDependency and is not bundled into `www/` or the APK. It is also only triggered when code calls `uuid.v3/v5/v6` with a caller-supplied undersized buffer or offset. **Action:** document it as "accepted, dev-only". Do not run `npm audit fix --force`, which could downgrade or upgrade `@capacitor/cli` across majors.

Proportionate scanning setup:
- Dependabot alerts and security updates, plus a weekly `dependabot.yml` for npm, gradle and github-actions
- `npm audit --omit=dev` in CI, failing only on high/critical production advisories
- GitHub secret scanning with push protection (free for public repos)

### Cited Findings
- **GHSA-w5hq-g745-h8pq**, "Missing buffer bounds check in v3/v5/v6 when `buf` is provided":
  - Affected versions: uuid < 11.1.1, 12.0.0, 13.0.0. Patched: 11.1.1, 12.0.1, 13.0.1.
  - Severity: Moderate, CVSS v4 6.3, with only low integrity impact.
  - The functions "accept external output buffers but do not reject out-of-range writes". `v1/v4/v7` already throw `RangeError`.
  - The primary risk is silent or truncated output. It is only security-relevant "if an application exposes buffer sizes or offsets to untrusted input". There is no code-execution path.
  - Source: [GitHub Advisory GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- Local `npm ls uuid` shows the only path is `@capacitor/cli@8.5.2 -> xcode@3.0.1 -> uuid@7.0.3`. `@capacitor/cli` is in `devDependencies`, and the runtime dependencies are only `@capacitor/{android,core,app,haptics,splash-screen}`. — repo inspection (package.json, `npm ls`), October 2026
- The `xcode` package is the iOS project manipulation library used by the CLI. SYNAPSE has no iOS project, so this code path is not even exercised during Android builds. This is an inference from the package name and the repo layout; I did not verify which CLI commands call `xcode`.
- **GitHub push protection.** These claims come from search-result summaries of docs.github.com pages, which I could not open:
  - User-level push protection is on by default for GitHub.com accounts and blocks pushing supported secrets to public repositories.
  - Repository-level push protection requires GitHub Secret Protection and is off by default.
  - GitHub enabled push protection by default for pushes to public repos starting in March 2024.
  - Sources: [GitHub Docs: push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection); [GitHub blog: Keeping secrets out of public repositories](https://github.blog/news-insights/product-news/keeping-secrets-out-of-public-repositories/)
- **Push protection limits.** The free default detects only specific, prefixed secret types and does not scan history. Users with write access can bypass it with a reason. — [GitGuardian analysis](https://blog.gitguardian.com/github-push-protection-enhancing-open-source-security-with-limitations-to-consider) (third party); [GitHub Docs: push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)

### Inferences
**Concrete, low-risk setup:**
1. Enable it in the repo: Settings → Security → Dependabot alerts plus Dependabot security updates, and Secret scanning plus Push protection. For public repos these are free.
2. Add `.github/dependabot.yml` with three `package-ecosystem` entries, all `schedule: weekly`:
   - `npm` (directory `/`)
   - `gradle` (directory `/android`)
   - `github-actions` (directory `/`)
   Optionally group `@capacitor/*` updates so Capacitor packages move together. The gradle entry matters because the shipped APK's native dependencies (AndroidX, WebKit) live there, not in npm.
3. In `.github/workflows/android.yml`, add a step `npm audit --omit=dev --audit-level=high`. This fails the build only for production-dependency advisories of high/critical severity, so the dev-only uuid moderate advisory will not break CI. (The `--omit=dev` and `--audit-level` flags are documented npm CLI options; the npm docs were not fetched here.)
4. Pin GitHub Actions to major versions at least (and SHAs for third-party actions). Dependabot's github-actions ecosystem keeps them current. This is standard supply-chain hygiene but was not sourced here.

**"Remove secrets from Git."** Already satisfied for real secrets: the release keystore and passwords are injected from GitHub Secrets. A one-time history scan (e.g. `gitleaks detect` or `trufflehog git file://.`) is cheap reassurance, because push protection does not scan existing history.

### Gaps
- docs.github.com and docs.npmjs.com could not be fetched (DNS/403), so exact current wording on Dependabot defaults (whether alerts are on by default for public repos), the coverage of devDependencies, and the semantics of the `npm audit --omit=dev` flag is not quoted from primary sources.
- I could not confirm whether `@capacitor/cli` 8.x has a release that bumps `xcode` or `uuid`. Checking `npm view @capacitor/cli dependencies` periodically would answer that.

---

## Q5. Is a committed debug keystore acceptable? Is unencrypted game progress in localStorage/IndexedDB "sensitive data"?

### Takeaway
Committing a debug keystore that is used only for debug builds is an accepted practice. F-Droid explicitly recommends sharing one `debug.keystore` across a team so that debug builds are interchangeable. Debug keys carry no trust in Google Play. The real requirements:
- never sign anything distributed to users with it
- keep the release/upload key out of Git (already done)
- consider enrolling in Play App Signing, so that the upload key can be reset if lost or leaked

Game progress (scores, levels, settings, no PII, no credentials) is not sensitive data in the OWASP MASVS/Capacitor sense. Encrypting it would add complexity and key-management problems with no security benefit, since the key would have to live on the same device. **Action:** none, beyond honest disclosure in the privacy policy and Play Data safety form.

### Cited Findings
- F-Droid docs: it "makes sense to reuse a shared debug.keystore among your team, since this is about smoothing the development process … all debug builds are interchangeable". For CI they recommend a separate keystore and to "keep that file safe, since it is the signing key for your nightly build". — [F-Droid: Publishing Nightly Builds](https://f-droid.org/docs/Publishing_Nightly_Builds/)
- The Capacitor security guide's data-security concern is secrets: "secret API keys, encryption keys, or any other sensitive data". It recommends Keystore/Keychain for "highly sensitive values such as encryption keys or session tokens". It does not ask for encryption of ordinary app state. — [Capacitor Security guide (source)](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/guides/security.md)
- Android backup-leak guidance: the advice to encrypt or exclude data concerns "unnecessary data that may be considered sensitive". OEM backup solutions may copy app data regardless of rules. — [Android: backup leaks (MASVS-STORAGE)](https://developer.android.com/privacy-and-security/risks/backup-leaks)
- OWASP MASTG has a demo where a WebView stores sensitive data in `localStorage`. The risk it illustrates is for sensitive values (tokens, PII), not general app state. — [OWASP MASTG-DEMO-0082](https://mas.owasp.org/MASTG/demos/android/MASVS-PLATFORM/MASTG-DEMO-0082/MASTG-DEMO-0082/)

### Inferences
- **Debug keystore risks** are low:
  1. Anyone can sign an APK as "SYNAPSE debug". Such an APK can only replace a debug install, never the Play-signed release, because signatures differ, and Play rejects debug-signed bundles.
  2. Confusion risk: make sure Gradle `release` signing never falls back to `debug.keystore` when the secrets are missing.
  The CI comment says "If the signing secrets exist: signed release AAB". Verify that the no-secrets path produces only a debug or unsigned artifact, clearly named, and is never uploaded to Play. This is a 1-minute check of `android/app/build.gradle`, worth doing.
- **Play App Signing.** With Play App Signing (the default for new apps publishing AABs), Google holds the app-signing key and the developer's key is only an upload key, which Google can reset if lost or compromised. This reduces the impact of the GitHub Secrets copy leaking. This is general knowledge; the Play Console docs were not fetched here, so it is flagged for the Play-policy researcher.
- **"Encrypt sensitive data."**
  - On Android, app-private storage is sandboxed per app and protected by full-disk/file-based encryption on modern devices.
  - On the PWA, storage is origin-scoped (with the github.io shared-origin caveat noted in Q3).
  - The only "attacker" who can read or modify progress is the device owner, who could cheat their own scores. That is a game-integrity issue, not data protection, and it only matters if online leaderboards are added. Then the fix would be server-side validation, not client encryption.
  - **Conclusion:** do not add encryption.
- **Classification of the generic "before launch" items for SYNAPSE:**

| Item | Relevant? | Concrete low-risk step |
|---|---|---|
| Security headers / CSP | Partly | Add the meta CSP from Q1, optionally `<meta name="referrer">`. Test plugins, SW and the logo blob mask on-device. Real headers only if moving off GitHub Pages. |
| Force HTTPS | Already done | Keep `server.url`/`cleartext`/`allowMixedContent` out of the production config. github.io is HTTPS-only. |
| Sanitize content | Not now | Rule: textContent for text; never interpolate stored or external strings into innerHTML. Adopt DOMPurify only if user or remote content appears. |
| Validate inputs | Not applicable as security (no input) | Robust parsing of saved progress with defaults on corruption (robustness). |
| Restrict files | Android: already done (file access off for targetSdk 36, no deep links). PWA: minor | Publish only `www/` to Pages instead of the repo root. |
| Scan dependencies | Yes, cheap | Dependabot (npm, gradle, actions) plus `npm audit --omit=dev --audit-level=high` in CI. Document uuid as dev-only, accepted. |
| Remove secrets from Git | Already done | Enable push protection; run one-time gitleaks/trufflehog history scan; keep debug.keystore (documented as debug-only). |
| Hide API keys | Not applicable | None (no keys). Re-evaluate if analytics, ads or a backend are added. |
| Encrypt sensitive data | Not applicable (no sensitive data) | None; keep `allowBackup` as a conscious choice and disclose local storage in the privacy policy. |

### Gaps
- Official Google Play Console documentation on Play App Signing and upload-key reset was not fetched in this pass. The claims about it above are general knowledge.
- No primary source found that formally classifies game progress under MASVS-STORAGE. The classification above is reasoned from the Capacitor, Android and OWASP definitions of "sensitive" (credentials, keys, tokens, PII).
