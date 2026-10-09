# Google Play security, privacy and policy requirements for SYNAPSE (offline Capacitor 8 game), as of October 2026

Method note: support.google.com (Play Console Help / Policy Center) could not be fetched directly from this environment (DNS failure), so Play Console Help content below comes from search-result extracts of those official pages, cross-checked with secondary sources where noted. developer.android.com pages were fetched in full. Local repo facts were verified by reading `android/variables.gradle` and `android/app/src/main/AndroidManifest.xml` on 2026-10-09.

Repo state verified locally: `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`; `@capacitor/android ^8.5.2`; manifest has `android:allowBackup="true"` with NO `android:dataExtractionRules` and NO `android:fullBackupContent`; permissions `INTERNET` and `VIBRATE`; `res/xml/` contains only `config.xml`; plugins: app, haptics, splash-screen.

## 1. Data safety form: how to fill it for an app that stores only on-device game progress

### Takeaway
On-device-only storage is NOT "collection": Google defines "collect" as transmitting data off the user's device, and data processed only locally need not be disclosed. SYNAPSE can truthfully declare "No data collected" and "No data shared", but it must still complete the Data safety form AND provide a privacy policy link; neither is optional, even for apps that collect nothing.

### Cited Findings
- Google defines "collect" as "transmitting data from your app off a user's device." — [Play Console Help: Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- "User data accessed by your app that is only processed locally on the user's device and not sent off device does not need to be disclosed." — [Play Console Help, Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- The count includes data sent off-device by libraries/SDKs bundled in the app, "irrespective of whether data is transmitted to you or a third-party server." — [Play Console Help, Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- Data sent off-device but processed ephemerally must still be entered in the form, though it may not be shown publicly; end-to-end encryption is a narrow exemption (no intermediary, including the developer, can read it). — [Play Console Help, Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- Every developer with an app published on Google Play must complete the Data safety form. That includes apps on closed, open or production testing tracks. Apps only on internal testing, system services and private apps are exempt. — [Play Console Help, Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- "Even developers with apps that do not collect any user data are required to complete the data safety form and provide a link to their privacy policy." (Google wording, as quoted by compliance vendors summarizing the help page) — [Termly](https://termly.io/resources/articles/android-privacy-policy/); [iubenda](https://www.iubenda.com/en/help/38933/-google-play-new-safety-section); primary: [Play Console Help, Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- All developers must also answer the data deletion questions in the Data safety form on the App content page. — [Play Console Help: Understanding app-account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- Privacy policy links must be publicly accessible and not geofenced, and must not be PDFs (stated in the Health apps policy context; this is the general Play privacy-policy link rule). — [Play Console Help: Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291)

### Inferences
- Recommended Data safety answers for SYNAPSE as verified: "Does your app collect or share any of the required user data types?" → **No**. This produces "No data collected" and "No data shared with third parties" on the store listing. Security-practice questions such as "encrypted in transit" and the deletion questions become largely N/A when nothing is collected. Users delete local data by clearing app storage or uninstalling.
- The only network call is fetching a bundled `privacy.html`. Because Capacitor serves bundled assets from the APK via its local scheme (`https://localhost`), nothing leaves the device, so it is not collection. If the policy link ever points to a remote URL opened in-app, opening a web page is still not app data collection, but re-check the form if analytics or crash reporting SDKs are ever added.
- Android Auto Backup to the user's Google Drive is an OS feature controlled by the user's Google account. The developer cannot read the backup data ("The backup data can't be read by the user or other apps on the device"; end-to-end encrypted on Android 9+). No Google statement was found that explicitly says whether OS backup counts as developer "collection". Under the "transmitted off device" definition one could argue either way. The widely followed practice is not to declare it, because the developer never receives the data. See Gaps.
- The Play Store listing needs a privacy policy URL that is public and non-PDF: an HTML page such as GitHub Pages. The bundled `privacy.html` inside the app does not by itself satisfy the store listing field; the same content must be hosted at a public URL.
- The PWA build is not covered by Play. If it is ever wrapped as a TWA for Play, the same form applies.

### Gaps
- No official Google statement was found on whether Android Auto Backup (Google Drive) data must be declared in Data safety. I recommend not declaring it, but treat that as an inference.
- The full current text of answer/10787469 could not be fetched directly (DNS block). The quotes come from search extracts of that page.

## 2. Target API level requirement in 2026 and Capacitor 8 default targetSdk

### Takeaway
Since **31 August 2026**, new apps and app updates on phones and tablets must target **Android 16 (API 36)** or higher. An extension to **1 November 2026** could be requested. Capacitor 8 defaults to `targetSdkVersion = 36` / `compileSdkVersion = 36` / `minSdkVersion = 24`, and SYNAPSE's `variables.gradle` already has exactly these values, so it is compliant.

### Cited Findings
- "New apps and app updates must target Android 16 (API level 36) or higher" (effective August 31, 2026). Wear OS and Android Automotive OS: API 35+. Android TV and Android XR: API 34+. — [developer.android.com: Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- Existing apps must target Android 15 (API 35)+ to remain available to new users on devices running newer Android versions. Otherwise they are only offered on devices with an OS version ≤ their target. — [developer.android.com target-sdk](https://developer.android.com/google/play/requirements/target-sdk); [Play Console Help: Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- An extension to November 1, 2026 is available via Play Console forms. — [developer.android.com target-sdk](https://developer.android.com/google/play/requirements/target-sdk)
- **Superseded:** the 2025 rule was API 35 for new apps and updates from 31 Aug 2025. Some early-2026 articles still cite API 35. — [Google Play's Target API level requirements for 2026 (secondary)](https://orangeoma.zendesk.com/hc/en-us/articles/21001579350172-Google-Play-s-Target-API-level-requirements-for-2026); [median.co](https://median.co/blog/google-plays-target-api-level-requirement-for-android-apps)
- Capacitor 8 `variables.gradle`: `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`. Capacitor 8 also uses AGP 8.13.0 and Gradle 8.14.3, requires Android Studio Otter (2025.2.1)+, recommends JDK 21 and requires Node 22+. — [Capacitor docs: Updating to 8.0](https://capacitorjs.com/docs/updating/8-0); [Capacitor plugin 8.0 update](https://capacitorjs.com/docs/updating/plugins/8-0); [Capgo upgrade guide (secondary)](https://capgo.app/blog/upgrade-capacitor-app-to-capacitor-8/)
- Capacitor ties the target SDK to its major version. Raising it above the Capacitor default "is likely to cause problems". — [Capacitor docs: Setting Android Target SDK](https://capacitorjs.com/docs/next/android/setting-target-sdk)

### Inferences
- No change is needed. Keep Capacitor 8.x at targetSdk 36 for any release before roughly August 2027.
- Targeting API 35+ means Android 15+ edge-to-edge enforcement applies. Targeting 36 means Android 16 behavior changes apply, such as large-screen orientation/resizability being ignored on displays ≥600dp. SYNAPSE's `android:screenOrientation="portrait"` will be ignored on tablets and foldables under API 36, so test landscape/resizable layouts on a tablet emulator. This comes from general Android 16 knowledge and was not separately sourced here.

### Gaps
- No official date was found for the API 37 requirement. One unofficial statement mentions August 2027; treat it as a forecast.

## 3. allowBackup=true vs dataExtractionRules / fullBackupContent; INTERNET permission

### Takeaway
Google's docs recommend setting backup attributes explicitly. For apps targeting API 31+, use `android:dataExtractionRules` (Android 12+) together with `android:fullBackupContent` (Android ≤11). Backing up non-sensitive game progress is fine and arguably user-friendly; SYNAPSE holds no credentials or identifiers. Recommended change: keep `allowBackup="true"`, add both rule files, and optionally set `disableIfNoEncryptionCapabilities="true"` on cloud backup. Removing INTERNET is technically possible for a fully local Capacitor app (manifest `tools:node="remove"`), and it is a defensible hardening step, but not required by Play.

### Cited Findings
- Apps targeting API 23+ participate in Auto Backup automatically. "The default value is `true`, but we recommend explicitly setting the attribute in your manifest." — [developer.android.com: Back up user data with Auto Backup](https://developer.android.com/identity/data/autobackup)
- "You can disable backups by setting android:allowBackup to false. You might want to do this if your app can recreate its state through some other mechanism or if your app deals with sensitive information." — [Auto Backup](https://developer.android.com/identity/data/autobackup)
- By default Auto Backup includes shared preferences, files in `getFilesDir()`/`getDir()`, databases and `getExternalFilesDir()`. It excludes `getCacheDir()`, `getCodeCacheDir()` and `getNoBackupFilesDir()`. — [Auto Backup](https://developer.android.com/identity/data/autobackup)
- Android 12+ (targeting API 31+) uses `dataExtractionRules`; Android 11 and lower use `fullBackupContent`. Apps targeting 31+ should still supply the legacy rules for older devices. Example manifest: `android:allowBackup="true" android:dataExtractionRules="@xml/backup_rules" android:fullBackupContent="@xml/backup_rules_legacy"`. — [Auto Backup](https://developer.android.com/identity/data/autobackup)
- For apps targeting Android 12+, `allowBackup="false"` disables cloud backup but "doesn't disable device-to-device transfers". D2D behavior varies by manufacturer. Use `<device-transfer>` exclusions to limit D2D. — [Auto Backup](https://developer.android.com/identity/data/autobackup)
- Backups are end-to-end encrypted on Android 9+ with the device PIN, pattern or password. On Android 12+, `<cloud-backup disableIfNoEncryptionCapabilities="true">` blocks cloud upload when encryption is unavailable. Credentials should not be in backed-up prefs or files (use Block Store). Exclude device-specific identifiers. "The backup data can't be read by the user or other apps on the device." — [Auto Backup](https://developer.android.com/identity/data/autobackup)
- Backups are stored in the user's Google Drive, protected by their Google Account, with a 25 MB per app limit and only the latest backup kept. They need Wi-Fi (unless mobile-data backup is enabled), the device idle and 24h since the last backup. — [Auto Backup](https://developer.android.com/identity/data/autobackup)
- Capacitor docs: WebView localStorage "must be considered transient… the OS will reclaim local storage from Web Views if a device is running low on space". For durable small data, Capacitor recommends the native Preferences API. — [Capacitor docs: Data Storage](https://capacitorjs.com/docs/guides/storage)
- The INTERNET permission can be stripped from the merged manifest with `<uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>`, with the `tools` namespace declared. Verify the merged manifest afterwards, because libraries can add it back. — [Anyline: Android Internet Permission](https://anyline.atlassian.net/wiki/spaces/SP/pages/3901947918/Android+-+Internet+Permission); a developer with a WebView showing only local content reported it "still everything works fine" without INTERNET — [B4X forum](https://b4x.com/android/forum/threads/remove-network-permission.75723/?amp=1)

### Inferences
- **Risk assessment:** SYNAPSE's backed-up content is game progress and settings only: no PII, no tokens, no secrets. Backup is low-risk and helps users keep progress across devices. There is no security reason to disable it. The Data safety answers are unaffected (see section 1).
- **Recommended concrete change:** add `res/xml/data_extraction_rules.xml` (`<cloud-backup disableIfNoEncryptionCapabilities="true">` + `<device-transfer>`, default include) and `res/xml/backup_rules.xml` (legacy `<full-backup-content>`), and reference both from `<application>`. Android Studio lint flags a missing `dataExtractionRules` on targetSdk 31+. Being explicit documents intent for reviewers and auditors.
- **WebView storage caveat:** Chromium WebView stores localStorage/IndexedDB under the app data dir, typically `app_webview/`, which is a `getDir()` directory. It is therefore likely included in Auto Backup by default, but this is unverified (see Gaps). Restoring WebView data across WebView versions is not guaranteed. If reliable progress backup and restore matters, mirror progress into Capacitor Preferences (SharedPreferences, which is explicitly backed up). Otherwise, treat restore as best-effort.
- **INTERNET permission:** Capacitor serves bundled assets via a local request interceptor (`https://localhost`), which does not use the network. So for SYNAPSE, removing INTERNET should work, and the Play listing would then show no network access. Trade-offs: `npx cap run` live reload needs network (debug only); any future remote link opened inside the WebView would fail (external links opened in the system browser are unaffected); Capacitor or plugin updates could re-add it via manifest merge. The step is optional hardening, not a Play requirement. If kept, the Data safety answers remain "no data collected", since permission ≠ collection. If removed, do it in the main manifest and verify with `aapt dump permissions` / merged manifest plus a full offline smoke test on device.
- `VIBRATE` is a normal install-time permission for haptics. No declaration is needed.

### Gaps
- No primary source was found confirming whether the WebView `app_webview` directory (localStorage/IndexedDB) is included in Auto Backup and restored correctly. It needs on-device testing with `adb shell bmgr backupnow <pkg>` / `bmgr restore`.
- No Capacitor-official doc was found that confirms Capacitor runs without INTERNET. This is based on its local-server architecture and community reports; verify on a device.

## 4. Families policy / target audience and content for a brain-training game

### Takeaway
Every app must complete the "Target audience and content" declaration in Play Console (App content). SYNAPSE is not automatically a "children's app". If the declared age groups are 13+ or 18+ only, the Families policy does not apply. If any under-13 age group is selected, or the art and copy appeal to children, the Families policy applies in full. With no ads, no SDKs and no data collection, SYNAPSE would likely comply even then, but it adds review scrutiny and obligations. Separately, the mandatory **Health apps declaration** has to be completed, and brain training appears within its scope.

### Cited Findings
- Developers must select target age groups in Play Console's Target audience and content section before publishing. Imagery and terminology that could be seen as targeting children may affect Google's assessment. Misrepresenting information "may result in removal or suspension". — [Play Console Help: Manage target audience and app content settings](https://support.google.com/googleplay/android-developer/answer/9867159); [Play Console Help: Families policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- If children are in the target audience, the app must meet Families requirements; failing to do so "may result in app removal or suspension". The first requirement is that content accessible to children must be appropriate for children. — [Families policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- If one of the target audiences is children, the app "must not transmit certain identifiers (including the advertising ID) for children or users of unknown age". — [AdMob Help, Families policy guidance](https://support.google.com/admob/answer/6223431?hl=en)
- Apps serving ads to children must use only Families Self-Certified Ads SDK versions. Mixed-audience apps need a neutral age screen. — [Families Self-Certified Ads SDK Policy](https://support.google.com/googleplay/android-developer/answer/12918983); [Families policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- Health apps declaration: every developer with a published app (including closed or open testing) must complete it under Policy > App content, even apps with no health features (they certify none). Brain training is listed under the "Activity and Fitness" health feature, and the form also lists "Stress management, relaxation, mental acuity". — [Play Console Help: Provide information for the Health apps declaration form](https://support.google.com/googleplay/android-developer/answer/14738291); [Health apps policy](https://support.google.com/googleplay/android-developer/answer/13996823)
- The Health/Medical policy bars misleading health claims and requires regulatory proof or a disclaimer for medical functionality. — [Play Console Help: Health apps policy](https://support.google.com/googleplay/android-developer/answer/13996823)

### Inferences
- **Recommendation:** declare the target audience as 13+ (or 18+ if the listing is aimed at adults). Avoid child-oriented imagery and copy. Answer the "could the app unintentionally appeal to children?" question honestly. This keeps SYNAPSE out of Families scope with no functional cost.
- **If under-13 audiences are included:** content must be child-appropriate. No advertising ID or other identifiers may be transmitted (already true). The privacy policy must address children, which helps with COPPA and GDPR-K posture. Store assets and IARC rating must be consistent. Joining "Designed for Families" or Teacher Approved is optional and brings extra review. SYNAPSE's zero-SDK, zero-network design makes compliance straightforward, but expect more review scrutiny.
- **Health declaration:** select the brain-training / mental-acuity feature if the store copy frames SYNAPSE as cognitive training. Store copy must avoid medical or therapeutic claims, such as "improves memory", "prevents dementia" or "clinically proven", unless substantiated. A disclaimer like "entertainment / not a medical device" is prudent.
- IARC content rating questionnaire: mandatory for all apps (well-established Play requirement; not re-sourced here). For SYNAPSE it should yield Everyone / PEGI 3.

### Gaps
- The exact 2026 wording of the Families policy page (9893335) and of the Health declaration category list could not be fetched directly. The search extracts may reflect 2024–2025 versions.
- The current enrollment status of the Families Self-Certified Ads SDK program is inconsistent across pages, but irrelevant because SYNAPSE has no ads.

## 5. Play App Signing and Play Integrity API

### Takeaway
New apps must be uploaded as Android App Bundles (AAB, required since August 2021), and AABs require **Play App Signing**. So Play App Signing is effectively mandatory, and the GitHub Actions key becomes the *upload key*. The **Play Integrity API is optional**; for an offline single-player game with no server it adds little, because verdicts are meant to be verified server-side.

### Cited Findings
- "As of August 2021, Google Play requires all new apps to be published as AABs." — [Ionic blog: Google Play AAB requirement](https://ionic.io/blog/google-play-android-app-bundle-requirement-for-new-apps)
- "Play App Signing, which is required for app bundles, protects your app signing key from loss by using Google's secure infrastructure." — [Android Developers Blog: The future of Android App Bundles is here (June 2021)](https://android-developers.googleblog.com/2021/06/the-future-of-android-app-bundles-is.html)
- The Play Integrity API helps "respond with appropriate action to reduce attacks and abuse such as fraud, cheating, and unauthorized access". It is opt-in, set up via Play Console > Release > App integrity, and should be used "together with other signals… not as a sole anti-abuse mechanism". — [Play Console Help: Use the Play Integrity API](https://support.google.com/googleplay/android-developer/answer/11395166); [developer.android.com: Play Integrity overview](https://developer.android.com/google/play/integrity/overview)

### Inferences
- **Action:** build `bundleRelease` (AAB) in CI and enroll in Play App Signing on first upload (default for new apps). Keep the GitHub Actions keystore as the upload key. If it leaks, an upload-key reset via Play Console is possible, unlike a lost app-signing key. Store an offline backup of the upload keystore and passwords outside GitHub.
- **Play Integrity:** skip it. With no backend, no leaderboards and no purchases, there is nothing server-side to protect and no place to verify tokens securely. Reconsider if online leaderboards or IAP are added.
- Play Integrity has its own Data safety guidance for apps that use it. It is not applicable here. — [developer.android.com: Play Integrity data safety](https://developer.android.com/google/play/integrity/other)

### Gaps
- The current wording of the AAB/Play App Signing requirement was not re-fetched from a 2026 primary page. The rule dates from 2021 and has no known reversal.

## 6. Other 2025–2026 Play policy changes relevant to SYNAPSE

### Takeaway
The relevant 2026 items are: (a) **Android developer verification**: Play Console identity verification, with Play apps auto-registered; enforced from 30 Sep 2026 in Brazil, Indonesia, Singapore and Thailand, global in 2027. (b) For a **new personal developer account**: a closed test with **12 testers for 14 consecutive days** before production access. (c) Mandatory App content declarations: Data safety, privacy policy, target audience, content rating, Health apps declaration, ads declaration ("No ads"). The **account deletion** requirement does not apply because there is no account creation.

### Cited Findings
- Android developer verification: rolling out to all Play Console developers from March 2026. Once Play Console verification is done, Google "will automatically register eligible Play apps". Manual claim only if auto-registration fails. Timeline: April 2026 Android Developer Verifier service appears; August 2026 limited-distribution accounts and advanced sideload flow globally; **30 Sep 2026** enforcement on certified devices in Brazil, Indonesia, Singapore and Thailand; global rollout 2027. Unregistered apps cannot be installed or updated through normal flows in enforced regions. — [Android Developers blog: Android developer verification rolling out to all developers](https://developer.android.com/blog/posts/android-developer-verification-rolling-out-to-all-developers-on-play-console-and-android-developer-console); [Android Developers Blog, June 2026](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)
- More than 99% of Play apps were registered automatically; developers should check the Play Console Home page for any unregistered apps. — [Help Net Security, June 2026](https://www.helpnetsecurity.com/2026/06/19/android-developer-verification-rollout-markets/) (secondary, citing Google)
- Some third-party blogs overstate the scope, for example claiming all developers must newly verify by September 2026; Google's own wording centers on app registration with a 2027 global rollout. — [testerscommunity.com (secondary)](https://www.testerscommunity.com/blog/android-developer-verification-2026) vs [developer.android.com blog](https://developer.android.com/blog/posts/android-developer-verification-rolling-out-to-all-developers-on-play-console-and-android-developer-console)
- New personal developer accounts (created after 13 Nov 2023) must run a closed test with at least 12 opted-in testers for 14 consecutive days before applying for production access. The count was originally 20 and reduced to 12 in late 2024. Organization accounts are exempt. — [testerscommunity.com guide (secondary)](https://www.testerscommunity.com/guides/how-many-testers-do-you-need-google-play); [extendsclass (secondary)](https://extendsclass.com/blog/google-plays-closed-testing-requirement-what-developers-need-to-know-in-2026)
- Account deletion: applies when the app "allows users to create an account from within your app". It requires an in-app path and a web link for deletion. Deactivation does not qualify. — [Play Console Help: Understanding app-account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- The Health apps declaration is required for all apps (see section 4). — [Play Console Help 14738291](https://support.google.com/googleplay/android-developer/answer/14738291)

### Inferences
- **Not applicable to SYNAPSE:** account deletion (no accounts), Families ads SDK rules (no ads), advertising ID declaration (answer "No"; no AD_ID permission in the manifest), Play Integrity, photo/video and other sensitive-permission declarations (none requested), Credential Manager / passkeys guidance (no login).
- **Pre-launch checklist:**
  1. Complete Play Console identity verification and confirm the app shows as registered.
  2. If the account is personal and new, plan the 12-tester / 14-day closed test.
  3. Complete App content: privacy policy URL (public HTML), Ads = No, App access = all functionality available without restrictions, Content rating (IARC), Target audience (recommend 13+), Data safety = no data collected or shared, Health apps declaration (brain training / mental acuity, no medical claims), Government apps = No, Financial features = None.
  4. Upload an AAB with Play App Signing.
  5. Keep targetSdk 36.
  6. Optionally add explicit backup rules and consider removing INTERNET.

### Gaps
- No post-30-September-2026 Google announcement confirming that enforcement actually went live was found. The sources available predate the deadline or are secondary.
- The 12-tester rule details come only from secondary sources, because the Play Console Help page could not be fetched. Confirm in Play Console (Dashboard > "Apply for production" checklist).
- I did not find any other 2026 Play policy change specifically affecting offline games with no data collection beyond those listed. The Play Policy announcements page for 2026 could not be reviewed directly.
