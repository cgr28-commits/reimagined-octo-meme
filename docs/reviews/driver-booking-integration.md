# My Jobs booking integration — review before release

Status: development branch `codex/driver-web-dashboard`, draft PR #678. No production deployment, migrations, real-data reads, assignments, payment changes or customer messages performed.

## Existing system inspected

- Cloudflare Worker `workers/addresses/src/index.ts` routes the existing booking and driver APIs.
- `TRACKING_STORE` is Cloudflare KV, not SQL. `paid-booking-store.ts` reads canonical paid bookings (`booking:ref:*`); `booking-job-store.ts` stores operational booking jobs; `tracking-store.ts` stores journey legs (`track:job:*`) and indexes. My Jobs joins these records; it creates no second production booking database.
- `driver-auth.ts` holds legacy owner/shared-driver key authentication. `driver-portal-session.ts` validates individual portal sessions in KV; `driver-portal-handlers.ts` exchanges invitations and issues scoped sessions. Session credentials travel in headers/body, with existing localStorage persistence and an optional HttpOnly cookie.
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

The new Pages preview bundles the actual driver read handlers against an isolated, read-only, in-memory KV-compatible fixture datastore. This is a synthetic integration environment, NOT a connection to live bookings and NOT a persistent Cloudflare staging KV database. The same existing record schema is used. Each request recreates fictional data. No production bindings, credentials, outgoing service calls or mutation routes are passed through. Test driver selection is deliberately public and grants access only to fictional records; it is not production authentication.

The preview Worker is built exclusively by `scripts/prepare-driver-integration.mjs`, separate from the production Worker. It explicitly constructs its environment, ignoring any Pages project secrets/bindings. CSP allows only same-origin API calls; GPS, third-party tracking and frames are blocked. Build-time random test-session material rotates on redeployment. It is server-only and is never included in the frontend bundle or URLs.

Before a persistent staging/live-data test: provision/verify an independent staging KV namespace and staging session identities, or an explicitly read-only production adapter. Do not reuse the existing preview Worker. No production credentials are required for this synthetic preview.

## Validation

- Offline integration contract: unauthenticated/invalid/expired sessions; exact assignment; same-name isolation; unassigned/name-only exclusion; owner visibility; cancelled actions; return metadata; pending customer-phone privacy; missing flight; cached delay fixture; read-only datastore; denied mutations; origin check on test login. No external requests permitted.
- Existing assigned-driver portal access, notification/privacy, owner jobs/profile and owner profile persistence tests pass.
- Worker TypeScript check passes.
- Existing distant outbound/return, retention, reassignment and invitation contract test passes.
- Static frontend build and Chromium/WebKit mobile checks are recorded in the PR's integration preview workflow. Mobile checks cover 320/390px, chronological future jobs, cancellation display, delayed flight fixture, test identity switching, empty/error states, overflow and absence of optional tracking.
- Test output contains assertions and fictional data only; no real customer information was accessed.

## Release blockers / remaining risks

1. No safe live read-only connection or persistent staging database has been verified. The public preview is synthetic, clearly labelled, and does not prove production data completeness.
2. Existing sessions use localStorage bearer credentials; an XSS vulnerability could expose them. Legacy email invitation links still contain access tokens, and legacy shared-key/API query compatibility remains. These pre-existing paths are not a claim of URL-secret-free authentication across the entire system. Review/migrate them before approving live access under the stricter requirement.
3. KV invitation read/delete is not atomic across concurrent requests or regions. Sequential reuse is denied, but strict one-use exchange needs an atomic coordinator. Existing logout clears the browser token rather than revoking the server record. These are production authentication hardening requirements.
4. Existing name-only assignments intentionally disappear from personal My Jobs until an admin explicitly assigns a saved profile. No assignments were migrated. Expired tracking records and missing historical return legs are not recreated by personal reads.
5. Flight monitoring remains OFF in production. Existing provider allowance/costs and credentials need verification before enabling it. Staging delay information is explicitly fictional; no live provider calls were made. No flight SMS/push alerts are activated.
6. Physical iPhone/Home Screen session persistence and GPS suspension are unverified. Web GPS still requires the page active and phone unlocked.

Do not merge, run production migrations, enable live driver access, or deploy Worker/frontend to production without explicit approval and resolution of the authentication blockers above.
