# My Jobs booking integration — review before release

## Mobile dashboard and GPS pause — 22 October 2026

This follow-up remains on draft PR #678. It does not activate real bookings or production access. The isolated staging workflow must pass before publishing this revision; its run is the deployment evidence, not this report alone.

- Personal booking cards now lead with pickup time, date, reference and labelled addresses. Passenger/luggage/vehicle/child-seat details, notes, driver pay, cash due, navigation and accept-gated telephone/WhatsApp links remain available. Buttons have at least 44px tap targets. Owner administration and backend assignment/authentication rules are retained.
- Driver labels map to the existing actions: Accept Job; Driver On Way (`start_tracking`, status only while GPS is off); Driver Arrived; Passenger On Board; Arrived at Destination; Journey Completed. The existing destination transition and customer notification handlers are preserved.
- Airport instructions reuse the existing company copy and leg-specific metadata. Missing flight numbers are highlighted; delayed flight/revised arrival rendering and five-minute visible-panel flight checks are preserved.
- Staging identity controls are in the document flow, below the header, so they cannot cover job buttons. They remain restricted to the fictional staging build. Home Screen guidance is collapsible.
- “Not yet open” was the GPS window (pickup minus 60 minutes until pickup plus 90 minutes), not an acceptance lock. GPS timing badges are hidden while GPS is disabled; accepting future jobs and journey actions remain available.

### GPS disabled behind one shared flag

`shared/live-gps.ts` sets `DASHBOARD_GPS_ENABLED=false`; its Worker copy is synchronized. Frontend `SERVICE_FLAGS.liveDriverTracking` uses that flag. GPS code is retained for a separately approved reactivation.

The driver and owner GPS watchers/heartbeats, permission requests, maps, live indicators, resume/stop controls and location history loading are gated off. Driver/customer location uploads, GPS sharing endpoints and new GPS-session requests return a disabled response before accessing location data. Journey handlers still apply the same statuses and notifications but do not enable sharing or create GPS sessions, including repeated on-way/arrival requests. Old stored positions are masked, not migrated or deleted.

New customer confirmation, reminder and on-way emails omit website tracking links through the shared link/template helpers. Existing tracking reminder automation was already retired and remains so. The `/track/` landing page now explains the pause and offers the business WhatsApp contact without loading the tracking client, polling or a map. Already delivered emails cannot be rewritten: their old links need the updated customer landing page when a future production rollout is approved. Production remains unchanged until then. Public GPS marketing/navigation follows the same off flag.

Google Maps directions, secure sign-in, assigned jobs, acceptance/decline, statuses, booking references/details, flight monitoring and manual WhatsApp contact remain functional. WhatsApp customer-message wording is unchanged. Nothing automatically sends Live Location; the driver must start it in WhatsApp. Pricing, payments and assignment records were not modified.

### Validation for this follow-up

Local checks pass: Worker typecheck; static frontend export; secure booking integration; invitation/session expiry; assigned-driver permissions; WhatsApp voice contracts; journey transitions; and the new `scripts/check-gps-disabled.ts`. GPS-off tests use fictional memory records and prohibit external requests. They exercise actual journey handlers, repeated transitions, denied GPS endpoints without datastore access, suppression of fresh cached positions and email tracking links, and absence of GPS sessions.

Expanded Chromium/WebKit staging tests cover 320px/390px layouts, 44px card controls, unobstructed staging controls, missing/delayed/return flights, contact privacy, cancellation, fictional browser-only accept/decline and every journey action, preserved manual WhatsApp behavior, no geolocation calls or GPS requests even after a stale response claims sharing is active, and the disabled customer tracking page. Runtime staging records remain read-only; action simulations are intercepted in tests only. Local browser binary download was unavailable, so browser/deployment results must be verified in the [isolated staging workflow](https://github.com/cgr28-commits/reimagined-octo-meme/actions/workflows/driver-web-preview.yml).

Staging review: https://my-jobs-secure-staging.cgr28.workers.dev/driver/ (fictional, read-only). Customer fallback: https://my-jobs-secure-staging.cgr28.workers.dev/track/ after the successful deployment gate. Physical iPhone/Home Screen checks remain for owner review. The existing unrelated pricing CI failure and real-booking activation blockers below remain separate release gates.

## Previous secure integration baseline

Status: secure staging published and verified on 22 October 2026. Development branch `codex/driver-web-dashboard`, draft PR #678. No production deployment, production migrations, real-data reads, assignments, payment changes or customer messages performed. A new auth Durable Object migration was applied only to the isolated staging Worker.

Review: https://my-jobs-secure-staging.cgr28.workers.dev/driver/ — choose a fictional driver and tap **Open test jobs**. No driver key is required. Staging fixtures expire after seven days; rerun the guarded staging workflow to refresh them.

## Existing system inspected

- Cloudflare Worker `workers/addresses/src/index.ts` routes the existing booking and driver APIs.
- `TRACKING_STORE` is Cloudflare KV, not SQL. `paid-booking-store.ts` reads canonical paid bookings (`booking:ref:*`); `booking-job-store.ts` stores operational booking jobs; `tracking-store.ts` stores journey legs (`track:job:*`) and indexes. My Jobs joins these records; it creates no second production booking database.
- `driver-auth.ts` holds the existing admin/shared-key authentication. Legacy portal sessions are in KV. The new optional `DRIVER_AUTH` binding switches personal access to atomic Durable Object invitations and revocable HttpOnly cookies; it is not enabled in production.
- `driver-assignment-handlers.ts`, `driver-assignment-utils.ts`, `shared/driver-portal-access.ts` enforce assignments. Owners retain all-booking access; the owner's My Jobs session is driver-scoped.
- `shared/flight-lookup.ts` uses the existing AeroDataBox integration. `tracking-handlers.ts` exposes the personal flight panel; `PersonalFlightStatus.tsx` displays returned provider information.
- Existing SumUp, booking creation, pricing, customer emails and WhatsApp handlers are unchanged by this integration follow-up.

## Changes

- The existing authenticated My Jobs API supplies booking references, addresses, dates/times, passengers, luggage, notes and leg-specific details. Existing pagination covers all retained future legs; frontend sorts chronologically.
- Personal driver sessions now require an exact assigned profile ID. Same-name drivers, unassigned jobs and legacy name-only records cannot pass personal-session checks. Unauthorized filtering fails closed. Existing shared-key compatibility remains separate.
- Preserve formatted pickup date/time in the driver privacy whitelist; integration/browser tests explicitly verify the pickup time is visible.
- Return flight number, airport access and Dublin terminal use return fields. A missing return flight never falls back to the outbound flight number.
- Cancelled/refunded journeys return no available journey actions. Cancelled bookings are labelled without claiming a refund occurred.
- Personal jobs-list reads never perform implicit flight lookup or return-leg backfill. Flight lookup is an explicit, assignment-checked request; the new frontend sends the job identifier in a POST body. Missing flights and cancelled jobs return clear unavailable states.
- Owner-to-My-Jobs navigation exchanges the invitation by POST before opening a clean `/driver/` URL; the new flow puts no credential in the URL.
- Existing optional advertising/chat/consent suppression on driver routes is preserved.

## Preview isolation and configuration

The existing `[env.preview]` in `workers/addresses/wrangler.toml` explicitly shares production KV. It is NOT a safe read-only staging connection and was not used. Owner GET requests may backfill return records; production reads were not attempted.

The secure staging Worker (`workers/addresses/src/driver-staging.ts`) uses the same booking handlers and schema with a dedicated `STAGING_BOOKINGS` KV binding. `scripts/configure-driver-staging.mjs` creates/reuses only `my-jobs-staging-bookings` and rejects any namespace ID found in the production/legacy-preview config. It generates a standalone config for **my-jobs-secure-staging**, with no production routes, cron jobs or service credentials. Deployment is restricted to the same-repository development branch and Preview environment.

The staging fixture seeder writes only fictional records, expiring after seven days. Runtime booking storage is wrapped read-only; mutations, emails, messages and GPS routes are denied. The public test-driver selector grants access only to fictional identities. It must never be enabled on a real-data environment. The existing sample Pages preview is a separate older preview.

Secure staging deployment and mobile CI passed for code commit `dd2bec30b08ab3f6220bf57b3413174bddbe0728` in [run 39741475476](https://github.com/cgr28-commits/reimagined-octo-meme/actions/runs/39741475476). Deployed Worker version: `69320afd-4d6e-484b-849d-8c656b5452c2`. The deployed health check confirmed the isolated database is seeded. Public API smoke checks passed for all three fixture profiles, cookie flags, code replay denial and server logout. The browser rendered the deployed sign-in page; cloud-browser click control timed out, so deployed interaction coverage comes from the API smoke checks and the matching build's Chromium/WebKit CI tests. No safe production read-only connection was found: the existing preview binding shares production storage, so it is not used.

### Secure sign-in implementation

- `driver-auth-coordinator.ts`: random 256-bit codes, hashed credentials at rest, 15-minute invitations, atomic one-use exchange, 30-day sessions, server-side logout/revocation, throttling and expired-record cleanup. The new SQLite Durable Object migration is configured only for the dedicated staging Worker.
- `secure-driver-handlers.ts`: same-origin POST plus intent-header checks; clean portal links; secure host-only HttpOnly SameSite=Strict cookie; no session token in JSON, JavaScript storage or URLs. Code requests use saved driver email and the existing Resend-only sender. No real emails were sent in testing.
- `SecureDriverPortal.tsx`: code sign-in, server session check, logout and clear errors, while preserving the approved My Jobs UI. Saved Home Screen access uses the same origin as the API.
- In secure mode, personal access rejects legacy shared driver keys, URL credentials and bearer session headers. An independently verified admin header still grants admin access, even when a driver cookie is present. The owner's personal cookie remains limited to explicitly assigned jobs.
- Assignment notifications use clean `/driver/` links when secure auth is configured. Existing production behavior remains unchanged until the binding and secure frontend are explicitly approved and deployed.

## Validation

- New local real Durable Object runtime checks pass: concurrent one-use exchange, replay denial, cookie attributes, persistent session/KV across restart, logout revocation, CSRF rejection, profile isolation, read-only records and denied mutations/external service requests.
- Expiry-boundary, hashed-storage, throttle and cleanup tests pass.
- Secure frontend static build and Worker typecheck pass. CI Chromium and WebKit checks PASS at 320px and 390px: login/reload/logout, jobs, return journey, fictional flight delay, cancellations, profile isolation, empty/error states, no overflow and no optional advertising. Browser screenshots are in the workflow artifact `my-jobs-preview`.

- Offline integration contract: unauthenticated/invalid/expired sessions; exact assignment; same-name isolation; unassigned/name-only exclusion; owner visibility; cancelled actions; return metadata; pending customer-phone privacy; missing flight; cached delay fixture; read-only datastore; denied mutations; origin check on test login. No external requests permitted.
- Existing assigned-driver portal access, notification/privacy, owner jobs/profile and owner profile persistence tests pass.
- Worker TypeScript check passes.
- Existing distant outbound/return, retention, reassignment and invitation contract test passes.
- Static frontend build and Chromium/WebKit mobile checks are recorded in the PR's integration preview workflow. Mobile checks cover 320/390px, chronological future jobs, cancellation display, delayed flight fixture, test identity switching, empty/error states, overflow and absence of optional tracking.
- Test output contains assertions and fictional data only; no real customer information was accessed.

## Release blockers / remaining risks

1. Staging configuration and permissions are verified: the existing Preview credentials successfully created the independent KV namespace and deployed the isolated Worker/auth storage. No missing staging permissions remain. Real booking completeness is unverified because production data was deliberately not accessed.
2. Production activation is deliberately pending: configure a separate production auth namespace and same-origin frontend/API routing; set the fixed HTTPS portal origin; verify saved driver email and the existing Resend configuration. The legacy production auth paths remain active until that approved rollout. Do not simply enable cookie UI against a cross-origin backend.
3. Existing name-only assignments intentionally disappear from personal My Jobs until an admin explicitly assigns a saved profile. No assignments were migrated. Expired tracking records and missing historical return legs are not recreated by personal reads.
4. Flight monitoring remains OFF in production. Existing provider allowance/costs and credentials need verification before enabling it. Staging delay information is explicitly fictional; no live provider calls were made. No flight SMS/push alerts are activated.
5. Physical iPhone/Home Screen session persistence and GPS suspension remain unverified. Browser tests simulate mobile sizes; they do not establish background GPS support. Web GPS requires the page active and phone unlocked.
6. A separate existing homepage/pricing CI check fails in `scripts/check-bfs-bhd-roi-instant-quote.ts:267` (actual £60, expected £63). The identical failure was reproduced from the pre-security commit `d8c616ce`, confirming it predates this follow-up. Pricing was not changed to hide the failure; resolve that release gate separately before merging.
7. HttpOnly cookies reduce credential theft but do not eliminate XSS risk. Existing admin authentication is unchanged. Session expiry/logout are implemented; a separate admin lost-device/session-management interface is not included.

Do not merge, run production migrations, enable live driver access, or deploy Worker/frontend to production without explicit approval. No paid upgrade or external flight subscription was enabled.
