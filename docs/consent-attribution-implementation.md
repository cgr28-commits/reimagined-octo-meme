# Consent and booking attribution implementation — review before release

Date: 17 October 2026. Prepared from the current remote main baseline.
Branch: `fix/consent-booking-attribution`. **Not deployed. Do not merge until release approval: main triggers production deployments.**

## Important changes

- Non-essential measurement is off by default. Google Ads loads only after advertising-measurement permission (basic consent gating); TrafficGuard script and no-JavaScript pixel are removed. Independent advertising-abuse beacons require permission in both browser and Worker. Operational security, address lookup and payment processing remain independent.
- Cookie Settings is accessible in the footer. Advertising measurement and website analytics have separate choices; personalisation always remains denied. Changing a choice clears optional storage. Withdrawal is sent to the Worker and retried if delivery fails. Browser shutdown is independent of its acknowledgement: a document-local CSP immediately blocks transport and the document reloads. Offline pages remain transport-blocked until reloading on reconnection. Frames/workers are forbidden before loading Google, preventing independent execution contexts; consent expiry and cross-tab changes also trigger shutdown. Old unversioned acceptance is not treated as new consent.
- A versioned, purpose-specific snapshot contains a random receipt ID, recorded/expiry timestamps and permissions. Maximum lifetime is 90 days. New marketing attribution is kept in expiring KV sidecars, separate from operational paid/pending/request records. Worker reads and upload retries check expiry and withdrawal, fail closed if unavailable, and never reconstruct click identities from fraud records.
- Whole first/last visits replace field-by-field merging. A Google Ads visit followed by a tagged Business Profile visit retains the first visit separately and makes GBP the last source; the old click ID is not attached to the new campaign. No pre-consent click capture or internal link decoration. SumUp returns preserve the saved source; pending checkout and paid booking use the existing payment identity.
- Paid purchases are server-only. Browser purchase emission is disabled. Payment and customer references stay separate; the canonical transaction/order ID is the payment reference. Only persisted paid records with eligible consent can upload; unpaid, cancelled, fully refunded and test/top-up cases are excluded. Missing acknowledgements are failures, not successes. Existing hourly retries retain the original conversion time and order ID; attempts and last-attempt time are visible. Measurement failures cannot fail payment confirmation.
- Uploads require `GOOGLE_ADS_PAID_UPLOAD_VERIFIED=true`; unset/false disables them. This is deliberately a release gate, not an instruction to enable it now.
- Admin report shows recorded requests, verified paid bookings, fare value, collected money, refunds, source/campaign, first source, evidence/confidence and upload status/attempts/errors. Deposits are not presented as fully collected fares; cash counts only when marked collected. It uses operational payments, not Google Ads modelled revenue. Raw click IDs and customer contact details are excluded.
- Privacy Policy is updated and a Cookie Policy added. These describe the proposed implementation; the live policies have not changed.

## Sanitised replacement verification

The replacement is based directly on the current remote main, without the rejected implementation commit in its outgoing ancestry. The full private implementation report is preserved outside the repository; only this generic report is included here. Private campaign/account diagnostics have been removed, and server account/action defaults replaced by explicit environment configuration. Test identifiers are fictional.

The complete outgoing diff and committed text snapshot were checked with Gitleaks and targeted identifier, personal-data and artifact checks. Candidate findings were browser storage-key names and existing synthetic test tokens; no genuine secret was identified. No private environment files, database dumps, customer booking exports or payment records are included in the outgoing changes. These checks cover the new outgoing history and current snapshot; they do not certify all previously public history.

The original sanitised replacement passed all 17 measurement regression suites, its production static build and frontend/Worker TypeScript checks. See the withdrawal follow-up below for newer validation. Server conversion uploads remain disabled by default. At that original replacement checkpoint no branch had been pushed, merged or deployed. Later review publication is recorded separately.

## Source rules and limits

| Evidence on the same permitted visit | Label | Confidence |
|---|---|---|
| Google click identifier, without conflicting campaign values | Google Ads | High |
| google + cpc/ppc/paidsearch, no click identifier | Google Ads | Medium |
| google + organic + campaign gbp | Google Business Profile | High |
| Google referring host without paid evidence | Organic search | Medium |
| Other campaign tags or external referring host | Referral / campaign | Medium |
| Observed entry without tags/referrer | Direct / no referrer | Low; not proof of a typed visit |
| Missing, conflicting, expired, withdrawn or legacy evidence | Unknown | Unknown |

Confidence is evidence strength, not a statistical probability or proof that a URL was genuinely clicked in an ad. URLs can be copied. The Google Ads upload uses the eligible last touch only; a previous ad followed by GBP is intentionally not uploaded using the previous click. Historical bookings are not backfilled with invented sources.

Report scope is the selected 7/30/90-day payment-created window, at most 200 paid records and 2,000 request records from existing indexes; a truncation warning is shown. It is not an all-time accounting ledger. Refunds/cancellations of paid bookings remain visible. Attribution becomes Unknown after its permission/retention period; operational money remains available. Closed/refunded conversions already sent to Google are not automatically retracted by this change; reconcile Ads separately if refund-adjusted optimisation is required.

For declined visitors the dashboard still counts operational paid bookings and money in Unknown. No fingerprinting, fraud-record joins, cookieless marketing pings or new advanced Consent Mode measurement are introduced. Aggregated operational reporting improves visibility without pretending to recover a declined visitor's source.

## External account checks required before release

Private account diagnostics are retained separately and are not included in this repository. A successful build does not establish the state of external advertising or analytics accounts.

Before enabling uploads, verify account/action ownership, API eligibility and upload diagnostics, same-action order-ID deduplication, conversion windows, campaign goals and consent requirements. Select one authoritative paid-booking conversion action. Distinct actions must not be assumed to deduplicate against one another. Verify GA4 destinations and receiving events separately; do not create replacement properties/actions simply because visibility is incomplete.

Server account and action identifiers must be supplied explicitly through the existing environment variables; the uploader has no account-specific fallback. The release gate remains disabled by default. No real conversion event was sent during testing.

Prepared GBP website URL (not published):

https://www.myairporttaxini.co.uk/?utm_source=google&utm_medium=organic&utm_campaign=gbp&utm_content=website

Automated URL/attribution tests preserve these values without merging a previous gclid. A real isolated browser homepage → quote → checkout check remains required before publishing the profile change.

## Validation

Original replacement `npm run check:measurement`: **17/17 suites passed**, using fictional records, in-memory KV and mocked Ads/OAuth/SumUp/email services. The runner blocks unmocked HTTP/fetch. The complete 17-suite measurement regression command was rerun for the sanitised replacement and passed. Additional checks cover the disabled upload gate and missing/invalid explicit account/action configuration.

| Requirement | Coverage |
|---|---|
| Accept, decline, changed/withdrawn choices, persistence, expiry, legacy re-consent | Conversion-tracking suite |
| Optional Google/fraud/analytics gates | Conversion, quote-funnel and ad-fraud suites; source wiring assertions |
| Backend evidence, revocation, failed upload/retry, unpaid/cancelled exclusion | Paid-booking suite, real implementation with mock KV/HTTP |
| First/last visits; Ads then GBP; checkout return preservation | Attribution suite |
| SumUp success/no browser return/duplicate notification | Paid finalize invoked with mocked verified checkout; repeat invocation does not resend conversion/notifications |
| Browser/server duplicate purchase prevention | Browser purchase disabled; repeated server finalization uses stable ID and sent status |
| Paid report, authorization, unpaid counts, no raw click IDs, deposit/cash/refund separation | Paid-booking suite |
| Existing prices/vehicles/5% return discount | Pricing confirmation, pricing/vehicle flow, airport fixed costs, public minibus capacity |
| Existing payment/customer details/notifications | Deposit cash, child seats + SumUp, transaction metadata, customer/owner email mocks, owner BCC and review-request suites |

Production `npm run build`: passed, including static generation and type validation; existing lint warnings remain. Worker TypeScript check: passed. No package dependencies were added. The shared worker mirror was refreshed only for changed/new modules; unrelated generated drift was excluded.

## Withdrawal follow-up

The failed-delivery blocker was caused by waiting for a server receipt before discarding the document. Removing a React Script component does not undo executed Google callbacks. The new shutdown blocks fetch/beacon, pixels, scripts, frames and workers immediately, clears optional storage, disables the command queue and reloads without awaiting the receipt. An essential denial cookie (up to 90 days) and denied URL marker protect navigation if storage writes fail, while retaining checkout query parameters. If all preference storage is refused, the URL marker protects that journey but cannot remember withdrawal across unrelated future visits; storage/browser support remains a review constraint. Offline recovery reloads behind the transport block. Retries retain unacknowledged receipt IDs. Before Google loads, a separate frame/worker CSP prevents optional tags creating independent contexts. This site uses top-level SumUp checkout, not embedded payment frames; future embedded functionality must review this restriction.

Repeatable browser harnesses: `scripts/browser/check-consent-journeys.mjs` and `scripts/browser/check-withdrawal-behaviour.mjs`. Supply `MATNI_PLAYWRIGHT_MODULE` (Playwright module/path) and `MATNI_CHROMIUM_PATH` (Chromium binary) as needed. The behaviour suite also requires `MATNI_GOOGLE_TAG_FILE`: download the actual gtag.js for fictional ID `AW-1234567890` outside the repository. Never supply a production container or commit the third-party vendor file. All external requests are intercepted; no live measurement or bookings are sent. Both harnesses explicitly override frontend API URLs. The full journey uses mocked HTTP services; the Worker implementation is exercised separately by integration suites.

The behaviour test executes Google's downloaded code, verifies its bootstrap, and supplements it with active fetch/beacon/pixel callbacks that continue running while offline to prove transport blocking. A fictional Google destination cannot verify a real account conversion action. Service workers are allowed in the behaviour browser context; application CSP restricts creation of workers/frames. This does not recall requests already sent, nor guarantee control of background work from older deployments. Check actual account/tag destinations in isolated staging before release.

Follow-up checks passed: 18 measurement suites (including the new shutdown suite); desktop and mobile Accept/Decline quote → mocked hosted checkout → confirmation; failed withdrawal delivery, offline recovery, blocked storage, cross-tab withdrawal, timer expiry and analytics-only persistence with executable Google code (nine behavioural scenarios, including mobile withdrawal/recovery/expiry). Source lint has zero errors and 56 existing warnings after fixing five unused parameters and the address-option accessibility warning. The eight existing hook warnings concern quote prefill/availability/selection dependencies, map cleanup and owner-rule memo stability. They were reviewed; broad quote effect changes were deferred because they could reset customer input. No warning remains in the consent/shutdown components. Frontend and Worker TypeScript checks and the production static export pass. Browser testing is Chromium-only; Safari/WebKit, real provider integration and a broader keyboard/focus review remain release gates. The additional checks below now cover real frontend-to-Worker HTTP integration with mocked providers.

The follow-up diff and sanitised outgoing history were scanned with Gitleaks and reviewed for confidential documentation, real customer/payment fixtures, environment files and vendor artifacts. Scanner candidates were exact public browser storage-key names, not credentials. The downloaded Google tag remains outside Git. The private implementation report and rejected commit remain excluded.

Follow-up files: `src/lib/measurement-shutdown.ts`, `src/lib/cookie-consent.ts`, `src/components/GoogleAdsTag.tsx`, `src/components/CookieConsent.tsx`, `src/components/AddressInput.tsx`, `src/lib/ads-attribution.ts`, `src/lib/google-ads-client.ts`, `src/app/cookies/page.tsx`, `scripts/check-measurement-shutdown.ts`, `scripts/check-measurement-suite.mjs`, both `scripts/browser/` harnesses, this report, and a stale configuration comment in `workers/addresses/wrangler.toml`. No runtime Worker/payment/pricing logic changes in this follow-up. No new dependencies, migrations or environment variables.

## Additional release checks

A same-tab privacy reload now snapshots only the existing essential booking draft before shutting down. A one-use, path-bound session marker (60 seconds, created at navigation time) restores the current form, including addresses, date and customer details. The fare is recalculated and payment remains server-validated. Other fresh visits still clear old addresses. No campaign/click data is added to this recovery mechanism.

`check:measurement` now has **19 passing suites**, adding normal fresh-visit address-policy regression coverage and one-use/expiry/path tests for privacy recovery. Six Chromium browser journeys pass through the real Worker entry point over HTTP: desktop/mobile Accept, Decline and withdrawal midway through the booking form. These assert real quote receipts, payment creation/verification, pending/paid persistence, customer/owner notification handlers, calendar handlers, duplicate webhook delivery, payment recorded before browser return, and confirmation-cache behaviour. Consent withdrawal preserves the unfinished form and permits payment afterwards. The isolated Node adapter uses in-memory KV and mocked SumUp, Places, routing, Calendar/OAuth and email; it does not replace verification of Cloudflare deployment/runtime behaviour or live provider configuration. Provider credentials are fictional; calendar signing keys are generated ephemerally in memory.

Harness: `scripts/browser/check-worker-booking-journeys.mjs`; set `MATNI_WITHDRAW_MID_BOOKING=true` for the two withdrawal journeys. It launches `scripts/browser/mock-worker-server.mts`, which never reads live environment settings and binds only to loopback. Each fictional booking uses a different date to avoid the legitimate availability block created by the previous paid booking. All unrecognised provider requests are blocked. Conversion uploads stay disabled in this adapter. Earlier mock-service harnesses remain available for frontend isolation.

The WebKit binary downloaded successfully, but required native libraries are missing. The normal dependency installer failed because this environment cannot perform the required identity/group operations. WebKit/Safari is **not passed**. Use a supported WebKit/Safari environment for isolated consent, expiry, withdrawal/recovery and booking/payment journeys before release.

Read-only external account checks were performed where available. Private account findings are deliberately excluded from this public report. Some requested checks remain unavailable because of connection visibility and query allowance limits. No external settings were changed; account/API approval and verification gates remain in force. Frontend/Worker TypeScript checks and static production export pass. Lint remains zero errors and 56 pre-existing warnings.

Additional files: `src/lib/booking-draft-storage.ts`, `src/components/QuoteCard.tsx`, `src/lib/measurement-shutdown.ts`, the shutdown and suite-runner tests, `src/app/cookies/page.tsx`, this report, and the two Worker HTTP browser-test files above. No production Worker/payment/pricing algorithm, dependencies, environment variables or database schema changes are required by this follow-up.

## Final release preparation — 17 October 2026

- Strong denial storage passes both an isolated fixture test (including stale KV, unavailable/missing binding, irreversibility and non-extending retention) and an actual local workerd/SQLite Durable Object test. Denial records contain only a timestamp per random consent receipt, expire after 180 days, and are never renewed by a retry. The server cannot act on an offline notice until it arrives. Browser shutdown remains independent of acknowledgement.
- The click-upload payload no longer sends `ad_personalization`, which Google's click-import documentation does not support. Advertising personalisation remains disabled in the browser. No enhanced customer identifiers are uploaded. Google currently restricts access to its legacy click-upload API for integrations without prior qualifying usage; a read-only connector does not establish the website uploader's eligibility. Verify the actual authorised integration, conversion customer/action ownership and a non-importing validation before approving the gate. Keep the existing imported purchase action authoritative for paid bookings only after approval; distinct browser/server actions do not deduplicate against each other.
- All 239 TypeScript regression checks were attempted with no credentials, unmocked network or live CLI access. **200 pass; 39 also fail or are unavailable on remote main.** There are no additional failures against that baseline. The full census is recorded in `docs/release-regression-results.md`. Four branch-specific differences were resolved: consent-policy/UI expectations were updated to the approved implementation, removed tracker assertions were corrected, and paid-record reads no longer add an empty attribution property or return legacy embedded attribution. No fare/discount/operational money logic changed.
- The focused measurement/booking suite passes **20/20**, including consented upload/retry mocks and operational booking independence. Chromium browser tests cover the real Worker HTTP boundary with mocked providers, and executable Google code remains network-intercepted. No production test booking, payment, notification or conversion is sent.
- A supported Ubuntu GitHub Actions matrix for Chromium/WebKit is prepared in `.github/workflows/consent-booking-release-checks.yml`. It installs browser libraries and runs only isolated tests, with read-only repository permissions and no secrets/deployment steps. Local WebKit cannot launch because required native libraries are missing and the normal installer fails identity/group operations. A prepared workflow is **not a passing WebKit result**; require its successful exact-commit run before release.
- Policies now distinguish optional advertising-abuse monitoring from essential operational security, disclose consented Google Ads sharing, and explain strong denials and offline limitations. Human review must approve actual processor/transfer arrangements, advertising-abuse purpose grouping, 90/180-day retention and essential-storage classification. No PECR analytics/security exemption or legal certification is assumed. Review saved-quote reminder classification separately before treating it categorically as transactional.

### Exact remaining Safari/WebKit check

On a supported browser runtime, run the two Worker HTTP booking harness modes and the executable Google behaviour harness with `MATNI_BROWSER=webkit` and mocked providers. Require desktop and 390px mobile Accept/Decline complete quote → date/details → mocked SumUp → confirmation; withdraw midway and retain all draft fields; verify duplicate provider webhooks and no-browser-return payment persistence. In fresh contexts verify analytics-only persistence, expiry, cross-tab withdrawal, delivery failure, offline recovery and blocked storage. Network capture must show zero optional requests before grant/after shutdown, including after recovery; optional identifiers must be cleared and personalisation denied. Repeat the customer-visible flow in native desktop Safari and iPhone Safari against a genuinely isolated test service if engine CI cannot cover the target device. Never use the existing preview configuration that shares production booking KV for fictional bookings.

### Safest cutover and rollback

After review and explicit deployment approval: deploy the Worker with the new binding/migration first, uploads false; verify strong denial acknowledgement, disabled-gate behaviour and operational endpoints in a genuinely isolated environment; then publish the matched frontend. Approve the external account/action cutover separately after uploader eligibility and same-action order-ID behaviour are verified. Enable no upload until all consent, browser and account gates pass. If that later gate is approved, perform a controlled monitoring/reconciliation period. Do not use a production conversion or customer booking as a smoke-test fixture.

Rollback keeps uploads false and retains the ConsentLedger class/binding/migration and denials. Roll back frontend/report components selectively while preserving privacy gates and operational compatibility. Never blindly restore the old always-on tracking, delete denials, drop the namespace or alter booking/payment/refund records. No destructive operational-data migration is needed.

Primary guidance reviewed: https://developers.cloudflare.com/kv/concepts/how-kv-works/ ; https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/ ; https://developers.google.com/google-ads/api/docs/conversions/upload-offline ; https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/ .

## Authorised publication instructions (not executed)

Use an authenticated GitHub connection with write permission to this repository. Authenticate using the normal GitHub CLI/browser flow or your approved credential manager, never by embedding a token in a URL. Review the local tip/diff, then:

```sh
git remote get-url origin
git log --oneline origin/main..fix/consent-booking-attribution
git merge-base --is-ancestor b5c857c fix/consent-booking-attribution
# The preceding ancestry check must exit 1 (excluded).
git push origin fix/consent-booking-attribution:refs/heads/fix/consent-booking-attribution
# Verify the remote branch SHA matches the reviewed local SHA.
git ls-remote origin refs/heads/fix/consent-booking-attribution
```

Do not use `--all`, `--tags`, `--mirror` or force-push. If the remote branch has conflicting history, stop and review it. Only after separate publication approval, create a draft PR with base main and this branch as head through GitHub; leave auto-merge disabled. Do not merge: main triggers deployment. The expected branch URL is `https://github.com/cgr28-commits/reimagined-octo-meme/tree/fix/consent-booking-attribution`; it is not a claim that the branch currently exists remotely.

## Storage, configuration and review requirements

No relational database migration, bulk production rewrite or new external service is required. A new SQLite Durable Object migration `v4-consent-ledger` and `CONSENT_LEDGER` binding are required in the existing Cloudflare Worker before release. The approved deployment must retain any prior denials during cutover; old unversioned browser consent is invalid. The upload gate is explicitly false in the checked-in production/local configuration. Existing TRACKING_STORE KV is reused. New keys: `measurement:paid:<paymentReference>`, `measurement:pending:<checkoutId>`, `measurement:request:<id>` (up to consent expiry/90 days) and `measurement:withdrawn:<receiptId>` (180 days). New operational fields record conversion attempts and last attempt. Legacy embedded attribution is ignored for new marketing reads/uploads; historical persisted copies are not bulk deleted or rewritten.

New environment flag: `GOOGLE_ADS_PAID_UPLOAD_VERIFIED`, default false. Existing Ads OAuth credentials and TRACKING_STORE are reused. GOOGLE_ADS_CUSTOMER_ID and GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID must be explicitly configured after verification; there are no account-specific defaults. No new secret is required. No live secret values were read, and no live settings were changed by this implementation. No GA4, Ads campaign, SumUp or GBP mutation was made.

Human compliance review before release:

- Approve specific consent wording/purposes, the grouping of advertising measurement and advertising-abuse monitoring, processor disclosures/transfers and 90/180-day retention. No analytics/security exemption is assumed. Review current UK PECR/UK GDPR guidance and essential storage inventory.
- A new **ConsentLedger Durable Object** provides strongly consistent denial checks. The existing KV interface is wrapped at both HTTP and scheduled entry points, so attribution writes/reads, reporting and upload retries share the same checks. Missing or unavailable binding denies marketing eligibility without disabling operational storage. Offline delivery can still delay server knowledge; requests already authorised/in flight cannot be recalled. No claim of instantaneous offline withdrawal is made.
- Consent snapshots record a browser declaration associated with a booking; they are not authenticated proof against a malicious forged client. Decide whether stronger server-issued receipts are needed for the evidence standard.
- Retention expiry prevents reads/uploads; deletion of already-sent Google data, old embedded historical copies, notification copies and fraud events follows a separate rights/retention process. Advertising-abuse event retention remains 90 days. Do not reuse those records for attribution after withdrawal.
- Do not enable advanced cookieless/modelled measurement or enhanced conversions without a separate documented legal and technical review. There is no claim of legal certification here.

## Release and rollback

1. Review this branch and resolve the browser, account/API and compliance gates. Keep uploads false until those checks pass. Approve deployment explicitly; merging main currently deploys frontend/Worker.
2. After approval, deploy the Worker and frontend as one coordinated release; verify essential-only booking first, then consented measurement with controlled non-production test endpoints. Approve Google Ads goal changes and GBP publication separately.
3. Emergency stop: set the upload gate false and retain consent gates. Revert the report/UI component independently if needed; it does not participate in booking/payment execution.
4. For a full code rollback, retain the withdrawal records and privacy gates or keep all optional tags/uploads disabled. Blindly reverting to baseline would reintroduce the audited consent issues. Operational records use compatible fields; no destructive database rollback is needed. Expiring sidecars can remain until TTL. Never erase booking/payment/refund records to roll back measurement.

Pricing, saloon/estate/group rules, 5% return discount, booking forms, autocomplete, SumUp verification, customer/business emails, WhatsApp and operational booking updates have **not intentionally been changed**. Relevant mocked regressions pass; the browser/external-service limits above remain.

## Primary references reviewed

- Google offline imports/API eligibility: https://developers.google.com/google-ads/api/docs/conversions/upload-offline
- Google upload diagnostics: https://developers.google.com/google-ads/api/docs/conversions/upload-summaries
- ICO cookies/storage guidance (page notes guidance is being revised): https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/

## Files changed

- `docs/consent-attribution-implementation.md`
- `env.example`
- `package.json`
- `scripts/check-ad-fraud-monitoring.ts`
- `scripts/check-ads-click-id-retention.ts`
- `scripts/check-conversion-tracking.ts`
- `scripts/check-google-ads-request-quote.ts`
- `scripts/check-measurement-suite.mjs`
- `scripts/check-paid-booking-ads-conversion.ts`
- `scripts/check-quote-funnel-analytics.ts`
- `scripts/check-sumup-booking-conversion.ts`
- `scripts/deny-measurement-test-network.cjs`
- `scripts/measurement-test-helpers.ts`
- `shared/ads-attribution.ts`
- `shared/google-ads-click-conversions.ts`
- `shared/marketing-report.ts`
- `shared/measurement-consent.ts`
- `shared/paid-booking-record.ts`
- `src/app/cookies/page.tsx`
- `src/app/layout.tsx`
- `src/components/AdsAttributionCapture.tsx`
- `src/components/CookieConsent.tsx`
- `src/components/CookieSettingsButton.tsx`
- `src/components/Footer.tsx`
- `src/components/GoogleAdsTag.tsx`
- `src/components/MarketingAttributionReport.tsx`
- `src/components/OwnerPaidBookingsPanel.tsx`
- `src/lib/ad-fraud-events.ts`
- `src/lib/ads-attribution.ts`
- `src/lib/cookie-consent.ts`
- `src/lib/google-ads-client.ts`
- `src/lib/google-ads-owner-status.ts`
- `src/lib/google-ads.ts`
- `src/lib/privacy.ts`
- `src/lib/quote-funnel-analytics.ts`
- `workers/addresses/shared/ads-attribution.ts`
- `workers/addresses/shared/google-ads-click-conversions.ts`
- `workers/addresses/shared/marketing-report.ts`
- `workers/addresses/shared/measurement-consent.ts`
- `workers/addresses/shared/paid-booking-record.ts`
- `workers/addresses/src/ad-fraud-handlers.ts`
- `workers/addresses/src/attribution-store.ts`
- `workers/addresses/src/booking-job-handlers.ts`
- `workers/addresses/src/booking-job-store.ts`
- `workers/addresses/src/finalize-paid-checkout.ts`
- `workers/addresses/src/index.ts`
- `workers/addresses/src/marketing-report.ts`
- `workers/addresses/src/measurement-consent.ts`
- `workers/addresses/src/paid-booking-ads-conversion.ts`
- `workers/addresses/src/paid-booking-store.ts`
- `workers/addresses/src/pending-checkout-store.ts`
