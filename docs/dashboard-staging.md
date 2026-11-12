# Owner Dashboard + Driver Portal — isolated staging

Everything for the mobile Owner Dashboard and the Driver Portal (Stage 1) is tested here, in the
separate **My Airport Taxi NI Staging** Cloudflare account (`ecad568dc411e28a3e435ef40b36c2b5`).
Nothing in this setup can read or change the live website, live bookings, live Stripe, email or WhatsApp.

## What exists in the staging account (created 10 Nov 2026)

| Resource | Name | Id |
| --- | --- | --- |
| KV | DASHBOARD_STAGING_TRACKING_STORE | 8d133016934944c0979535a0fb823108 |
| KV | DASHBOARD_STAGING_BOOKING_COUNTER | b4e416eddd674adfb402643d50884663 |
| D1 | dashboard-staging-drivers | 8771026d-d11a-49cf-9af2-eb3683c3a355 |
| Worker | matni-dashboard-staging | created by the workflow |
| Pages | matni-dashboard-staging | created by the workflow |

The existing `BOOKING_COUNTER` / `TRACKING_STORE` namespaces and the `matni-payment-staging` Worker in that
account were left untouched.

## Safety layers

1. **Separate account.** The staging config (`workers/addresses/wrangler.dashboard-staging.toml`) is pinned
   to the staging account id; the workflow refuses to deploy if any live resource id appears in it.
2. **Outbound sandbox.** The staging build defines `__MATNI_STAGING_SANDBOX__`, which replaces `fetch` for the
   whole Worker (including Durable Objects). Every external request — Resend, Web3Forms, MailChannels,
   FormSubmit, WhatsApp, Stripe, Google Ads, address lookups — is refused before it leaves Cloudflare.
   `GET /staging/sandbox-status` shows it is on and lists recently blocked calls (query strings never logged).
3. **No schedules.** `crons = []`, and `scheduled()` returns immediately on the staging build.
4. **No email binding and one secret only.** The workflow fails if any secret other than the staging
   `OWNER_ACCESS_KEY` exists on the staging Worker, and refuses a staging key equal to the live owner or
   driver key.
5. **Frontend.** Built against the staging Worker only, with no Google Ads, Web3Forms or Places keys, a
   `noindex` header and a `Disallow: /` robots file. The live site's CORS never trusts the staging origin.

## One-time setup (owner)

1. Cloudflare → switch to the **My Airport Taxi NI Staging** account → My Profile → API Tokens → Create
   token → Custom token. Permissions (Account, *My Airport Taxi NI Staging only*):
   Workers Scripts: Edit · Workers KV Storage: Edit · D1: Edit · Cloudflare Pages: Edit · Account Settings: Read.
2. GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:
   - `STAGING_CLOUDFLARE_API_TOKEN` = the token from step 1
   - `STAGING_OWNER_ACCESS_KEY` (optional) = a new long random key (at least 24 characters), **not** the live key.
     Without it the deploy makes a private key for itself: the cloud tests still run, but nobody can sign in to staging.
3. Actions → "Deploy Dashboard Staging (isolated account)" → Run workflow on `claude/owner-dashboard-mobile`.

Without those secrets the workflow skips the deploy with a warning — nothing fails and nothing is deployed.

## Links once deployed

- Owner Dashboard: `https://matni-dashboard-staging.pages.dev/owner/?ui=mobile` → More → Drivers
- Driver portal: `https://matni-dashboard-staging.pages.dev/driver-portal/` (drivers open the single-use link
  the owner copies from the Drivers screen)

## Stage 1 scope (built)

- Owner: invite (link to copy — nothing is sent), review documents (accept / reject with reason),
  approve / decline / suspend / reinstate / remove (reasons kept), single-use 30-minute sign-in links,
  office messages, permanent audit trail, private driver-support number.
- Approval needs accepted, in-date: operator licence, taxi driver licence, vehicle licence, insurance.
- Driver: apply (own operator licence confirmed), add/renew documents with expiry, Available / Unavailable,
  Contact office (Call when the support number is set; otherwise Message the office), sign out.
- Suspend / decline / remove signs the driver out everywhere and cancels unused links.
- The support number is never on the website or in the audit log, is only returned to approved signed-in
  drivers, and cannot be the AI receptionist line 028 9602 2952.
- Audit log is append-only (database triggers reject updates and deletes).

Not in Stage 1: jobs, offers, assignment, earnings, payments, notifications, document photo upload
(needs a private R2 bucket — to be approved), httpOnly cookie sessions (need a same-site domain; Stage 1
uses an individual session token header, revoked on suspend/remove).

## Stage 2 scope (built on staging 12 Nov 2026 — not live)

Routes `/owner/driver-jobs*` and `/driver-portal/jobs*` (`workers/addresses/src/driver-jobs.ts`), tables in
`migrations/driver-db/0004_stage2_offers_jobs.sql`. All answer 404 without a `DRIVER_DB` binding.

- **Offers** — one per booking leg. *Fixed price*: owner sets the driver fee, first invited driver to accept gets
  it (a conditional update plus a unique "one live job per leg" index make a double award impossible).
  *Bids*: private prices; the owner always chooses, the lowest never wins automatically. *Direct*: one named
  driver accepts or declines. Offers only go to approved, available drivers with in-date documents (direct may
  go to an approved driver switched to unavailable). Offers never stay open past the pickup time.
- **What a driver sees** — before the job is theirs: date, time, area (no street, no full postcode), passengers,
  their fee. After: full addresses, customer first name and mobile, flight, notes, their fee. Never the customer
  fare or the margin; never another driver's bid. Customer phone disappears once the job is finished.
- **Customer email** — when a driver takes a job, the existing "Your driver details" email (first name, mobile,
  partial registration) is sent. Drivers must add a vehicle registration before they can accept.
- **Status** — On the way → Arrived → Complete, in order, own jobs only. Arrived and Complete store the phone's
  position, accuracy and server time privately for the owner; if the phone won't share it the status still
  updates and the record says "location not verified". Completion never pays anyone.
- **Changes** — if the booking's date, time, pickup or drop-off no longer matches the job, the driver must
  choose Accept Change or Can't Do New Time. Until then (and after "can't do") the driver stays assigned on the
  old details; only the owner can release them (reason required). A cancelled booking closes the job.
- **Owner alerts** (`escalations`) — urgent driver reports, a declined direct assignment, "can't do the new
  time", an unanswered change, an offer nobody took. High-priority ones go to the phone at once and repeat after
  2, 5, 10, 15… minutes until acknowledged, with an email from the second reminder. Acknowledging stops the
  reminders only; it never changes a job or booking.
- **Booking record** — `driver-jobs-wiring.ts` writes the driver (with `driverAccountId`) onto the booking when
  a job is confirmed and clears it on release. It leaves alone a booking arranged through the older email flow.
- **Staging-only test bookings** — `POST /staging/test-booking` (owner key; compiled out of the live build; can
  only touch ids starting `stg-test-`).

Before this can go live: add a D1 database and `DRIVER_DB` binding to the live Worker, a cron for
`runDriverJobsMaintenance` (already hooked into `scheduled`, inert without the binding), and the owner's approval.
On staging there are no crons, so reminders fire when a dispatch screen is opened.

Not in Stage 2: any payment or Stripe Connect work (Stage 3), earnings screen, document photo upload.

## Checks

```
npx tsx scripts/check-driver-jobs.ts       # Node 22 — full Stage 2 flow on real SQLite

```
npx tsx scripts/check-driver-accounts.ts   # Node 22 (node:sqlite) — full Stage 1 flow on real SQLite
npx tsx scripts/check-staging-sandbox.ts
```
