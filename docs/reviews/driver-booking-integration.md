# My Jobs booking integration — review before release

Status: development branch `codex/driver-web-dashboard`, draft PR #678. No production deployment, migrations, real-data reads, assignments, payment changes or customer messages performed.

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

Secure staging deployment and mobile CI results are pending in this revision. No safe production read-only connection was found: the existing preview binding shares production storage, so it is not used.

### Secure sign-in implementation

- `driver-auth-coordinator.ts`: random 256-bit codes, hashed credentials at rest, 15-minute invitations, atomic one-use exchange, 30-day sessions, server-side logout/revocation, throttling and expired-record cleanup. The new SQLite Durable Object migration is configured only for the dedicated staging Worker.
- `secure-driver-handlers.ts`: same-origin POST plus intent-header checks; clean portal links; secure host-only HttpOnly SameSite=Strict cookie; no session token in JSON, JavaScript storage or URLs. Code requests use saved driver email and the existing Resend-only sender. No real emails were sent in testing.
- `SecureDriverPortal.tsx`: code sign-in, server session check, logout and clear errors, while preserving the approved My Jobs UI. Saved Home Screen access uses the same origin as the API.
- In secure mode, personal access rejects legacy shared driver keys, URL credentials and bearer session headers. An independently verified admin header still grants admin access, even when a driver cookie is present. The owner's personal cookie remains limited to explicitly assigned jobs.
- Assignment notifications use clean `/driver/` links when secure auth is configured. Existing production behavior remains unchanged until the binding and secure frontend are explicitly approved and deployed.

## Validation

- New local real Durable Object runtime checks pass: concurrent one-use exchange, replay denial, cookie attributes, persistent session/KV across restart, logout revocation, CSRF rejection, profile isolation, read-only records and denied mutations/external service requests.
- Expiry-boundary, hashed-storage, throttle and cleanup tests pass.
- Secure frontend static build and Worker typecheck pass; mobile Chromium/WebKit tests run in CI because browser installation is unavailable in this workspace.

- Offline integration contract: unauthenticated/invalid/expired sessions; exact assignment; same-name isolation; unassigned/name-only exclusion; owner visibility; cancelled actions; return metadata; pending customer-phone privacy; missing flight; cached delay fixture; read-only datastore; denied mutations; origin check on test login. No external requests permitted.
- Existing assigned-driver portal access, notification/privacy, owner jobs/profile and owner profile persistence tests pass.
- Worker TypeScript check passes.
- Existing distant outbound/return, retention, reassignment and invitation contract test passes.
- Static frontend build and Chromium/WebKit mobile checks are recorded in the PR's integration preview workflow. Mobile checks cover 320/390px, chronological future jobs, cancellation display, delayed flight fixture, test identity switching, empty/error states, overflow and absence of optional tracking.
- Test output contains assertions and fictional data only; no real customer information was accessed.

## Release blockers / remaining risks

1. Staging deployment requires the existing GitHub Preview environment's Cloudflare account ID and token with Workers Scripts and KV access. Deployment success and the actual review URL must be checked before reporting the new preview ready.
2. Production activation is deliberately pending: configure a separate production auth namespace and same-origin frontend/API routing; set the fixed HTTPS portal origin; verify saved driver email and the existing Resend configuration. The legacy production auth paths remain active until that approved rollout. Do not simply enable cookie UI against a cross-origin backend.
3. Existing name-only assignments intentionally disappear from personal My Jobs until an admin explicitly assigns a saved profile. No assignments were migrated. Expired tracking records and missing historical return legs are not recreated by personal reads.
4. Flight monitoring remains OFF in production. Existing provider allowance/costs and credentials need verification before enabling it. Staging delay information is explicitly fictional; no live provider calls were made. No flight SMS/push alerts are activated.
5. Physical iPhone/Home Screen session persistence and GPS suspension remain unverified. Browser tests simulate mobile sizes; they do not establish background GPS support. Web GPS requires the page active and phone unlocked.
6. HttpOnly cookies reduce credential theft but do not eliminate XSS risk. Existing admin authentication is unchanged. Session expiry/logout are implemented; a separate admin lost-device/session-management interface is not included.

Do not merge, run production migrations, enable live driver access, or deploy Worker/frontend to production without explicit approval. No paid upgrade or external flight subscription was enabled.
