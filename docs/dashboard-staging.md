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

## Checks

```
npx tsx scripts/check-driver-accounts.ts   # Node 22 (node:sqlite) — full Stage 1 flow on real SQLite
npx tsx scripts/check-staging-sandbox.ts
```
