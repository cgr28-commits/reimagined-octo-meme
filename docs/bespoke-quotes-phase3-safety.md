# Bespoke quotes: Phase 3 safety fixes and preview readiness

Status: development branch only. Not deployed, no migration applied, no Cloudflare resources created.

## 1. Airport automations: explicit booking type (approved change #4)

- **Marker:** bespoke bookings carry `bookingType: "bespoke"` and `bespokeQuoteReference`.
  - The marker is set in `buildBespokeBookingDetails`.
  - It is copied by the existing creators at the moment of creation, so a bespoke booking is never stored unmarked:
    - `savePaidBookingRecordFromConfirm` → paid record
    - `createTrackingJobFromBooking` → tracking job
  - Fields added (optional; absent for every ordinary booking): `PaidBookingDetails`, `PaidBookingRecord`, `TrackingJobRecord`.
- **Return-offer emails** (`shared/return-offer.ts`):
  - The snapshot copies `bookingType`.
  - `isEligibleForReturnOffer` → `bespoke_quotation` (not eligible), checked first.
- **Airport pickup reminder:**
  - `airportPickupReminderInput` reads `paid.bookingType ?? job.bookingType`, so the job marker covers an unreadable paid record.
  - `evaluateAirportPickupReminder` → skip `bespoke_quotation`.
- **Never decided by text:** a test proves an ordinary booking with a "Business Class (bespoke)" vehicle label and a bespoke-sounding note still gets its return offer.

Test results (`npm run check:bespoke-isolation`):

| Booking | BFS from / to | BHD from / to | DUB from / to |
|---|---|---|---|
| Bespoke: return offer | not eligible / not eligible | not eligible / not eligible | not eligible / not eligible |
| Bespoke: pickup reminder | skipped / skipped | skipped / skipped | skipped / skipped |
| Ordinary: return offer | eligible / eligible | eligible / eligible | eligible / eligible |
| Ordinary: pickup reminder | **sent** / n/a (drop-off) | **sent** / n/a | **sent** / n/a |

Existing checks `check:return-offer` (3 scripts) and `check:airport-pickup-reminder` still pass.

## 2. Google Calendar duplicates

- **Cause:** the existing insert lets Google choose the event id. A crash or lost response after creation, followed by a retry, creates a second event.
- **Bespoke fix** (`workers/addresses/src/bespoke-calendar.ts`): the event id is ours.
  - It is `bq` + SHA-256(calendar, payment reference, leg), which is valid Google base32hex.
  - Google guarantees event ids are unique per calendar and answers 409 to a second insert.
  - Each leg: **look up first** (exists → reuse). Otherwise insert with that id; a 409 means it exists → reuse.
- **Anything unexpected** (network error, 5xx) → `uncertain`. Nothing is guessed:
  - the booking still confirms (a paid booking is never blocked by the calendar)
  - the owner gets one alert
  - the dashboard shows **Retry calendar**, which is safe because it uses the same id
- **Tested:**
  - crash immediately after Google created the event (response lost)
  - a lookup/insert race (409)
  - a network error, a 503, and repeat retries
  - two-leg bookings
  Each ends with exactly one event per leg.
- **Airport path unchanged:** `google-calendar.ts` and `logPaidBookingCalendar` are untouched (a test enforces this). Bespoke bookings never use the airport logger (a test asserts zero calls).

## 3. Stripe recovery audit

| Scenario | Behaviour | Duplicate charge possible? | Payment lost? | Evidence |
|---|---|---|---|---|
| Checkout creation idempotency | Attempt + fixed reference stored before any Stripe call. Creation runs inside the existing payment-operation claim; a completed result is reused. Stripe `Idempotency-Key` (same reference, same hour, same params) returns the same session. | No: the customer only ever receives the URL of the session attached to the attempt | n/a | §1, §8 |
| Concurrent Stripe requests | The claim serialises calls; the second click waits ("in progress") or gets the same session. Stripe never sees two concurrent creates for one attempt. | No (12 concurrent clicks → 1 session) | n/a | §2 |
| Lost Stripe response | Claim released; the retry with the same reference and hour gets the same session. A retry in a *new* hour may create a new session, but the earlier one's URL was never given to anyone, so it cannot be paid. If it somehow were, it would be recorded as `unexpected_checkout` → review. | No | No | §8 |
| Crash after creating, before storing | The completed claim result is reused → same session; pending record and attach complete on retry. | No | No | §8 |
| Expired sessions / abandoned checkout | The sweep tracks the **30-minute attempt** expiry (fixed this round: previously the quote expiry, up to 14 days). Stripe checked: paid → recorded; open → **session expired first**, then attempt released; expired → released. | No: a released attempt's session can no longer be paid | No | §10, §10b |
| Payment completed after cancellation | Owner cancel expires the session. A payment completed just before → recorded → `paid_after_cancellation` review. | No | No | §6 |
| Webhook retries | Every path (browser, webhook, sweep) goes through the shared per-checkout claim; repeated webhooks change nothing. The existing route always answers 200, so Stripe does not retry — hence the sweep. | No | No: the sweep finds unrecorded payments within ~30 minutes | §3, §10b |
| Payment recorded, booking interrupted | Payment kept as PAID. The sweep retries the booking every 5 minutes until CONFIRMED; each step is idempotent (MAT reference, job and calendar dedupe). | n/a | No | §4 |
| Orphan session (no pending record) | Webhook fallback records it from the session's client reference → review. | n/a | No | §9 |
| Second payment on a confirmed booking | Recorded, review opened, booking stays CONFIRMED. No auto-refund. | Flagged for manual refund | No | §9 |

Section numbers refer to `scripts/check-bespoke-payment.ts`.

Fixed this round: payments that were never recorded (tab closed and webhook lost) were previously found only at the quote's own expiry. They are now found within about 30 minutes.

**Not verifiable offline:** real Stripe idempotency, concurrency (409 "request in progress") and session-expiry behaviour. These are on the preview test list.

## 4. Preview deployment readiness

Files:
- `workers/addresses/wrangler.bespoke-preview.toml`
- `workers/addresses/src/preview-entry.ts` (preview-only; production never loads it, and the production bundle contains no reference to it)
- the audit test `npm run check:bespoke-preview`

### Isolation audit

| Item | Preview | Production dependency? |
|---|---|---|
| Worker | `reimagined-octo-meme-bespoke-preview` (`workers_dev` only, no routes or custom domains) | None |
| Durable Objects | Belong to the preview script (one `preview-v1` migration) | None: separate storage |
| KV | Two NEW namespaces (placeholders). Production ids forbidden; a test enforces this | None |
| Stripe | `PAYMENT_PROVIDER=stripe-test`; the entry **refuses to run** unless the key is `sk_test_`/`rk_test_`; the outbound guard blocks Stripe calls without a test key | None |
| Stripe webhook | Separate test-mode endpoint and `whsec_` | None |
| SumUp | No keys; `api.sumup.com` blocked | None |
| Email | No `send_email` binding. **All** outgoing email (bespoke and existing airport code, including hard-coded `bookings@` alerts and FormSubmit/Web3Forms/MailChannels fallbacks) is blocked unless every recipient is in `PREVIEW_EMAIL_ALLOWLIST`. Owner-alert settings point at the tester. | None (tested with the existing unfinished-payment job) |
| Owner access | New preview-only `OWNER_ACCESS_KEY`; production `DRIVER_ACCESS_KEY` never copied | None |
| Turnstile | Cloudflare test keys | None |
| Scheduled jobs | `*/5` only: bespoke sweep plus existing 5-minute jobs, acting on empty preview KV. No hourly jobs (review requests, reports, reminders). | None |
| Other outgoing integrations | Default-deny. Allowed: Stripe (test), Turnstile, Resend (filtered), Google Places/Maps, Google token + Calendar (test calendar only, if configured). Blocked: SumUp, WhatsApp/Meta, 360dialog, Google Ads, AeroDataBox, Anthropic, FormSubmit, Web3Forms, MailChannels, the production Worker and website, everything else. | None |
| Customer data | Empty namespaces; test data only | None |
| Deploy path | No workflow references the preview config (tested) | None |

### Checklist (★ = owner approval/action)

1. ★ Approve creating, in Cloudflare account `36c5c88d…`, 1 Worker + 2 KV namespaces.
2. Create the namespaces (`wrangler kv namespace create …`) and paste their ids into the preview toml.
3. ★ Name the tester inbox(es). Replace every `REPLACE_WITH_TESTER_EMAIL` (`PREVIEW_EMAIL_ALLOWLIST`, `BESPOKE_EMAIL_ALLOWLIST`, `STRIPE_TEST_EMAILS`, `BOOKING_TO_EMAIL`, `BOOKING_NOTIFICATION_EMAIL`, `OWNER_EMAIL_COPY_ADDRESS`).
4. ★ Choose the preview site host (separate Cloudflare Pages preview project, or local `npx serve out` against the preview Worker). Set `SITE_ORIGIN` and `TURNSTILE_ALLOWED_HOSTNAMES`. Add the host to the Worker CORS allow-list (small code change, for approval).
5. ★ Provide Stripe **test** keys. Create a test-mode webhook endpoint (`checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`) → `https://reimagined-octo-meme-bespoke-preview.<subdomain>.workers.dev/payments/stripe-webhook`.
6. Set preview secrets with `--config wrangler.bespoke-preview.toml`:
   - `STRIPE_SECRET_KEY` (sk_test_), `STRIPE_PUBLISHABLE_KEY` (pk_test_), `STRIPE_WEBHOOK_SECRET`
   - `TURNSTILE_SECRET_KEY` (test secret)
   - a new `OWNER_ACCESS_KEY`
   - optional: a restricted `RESEND_API_KEY`; `GOOGLE_PLACES_API_KEY`; a test calendar's `GOOGLE_CALENDAR_*`
7. `npm --prefix workers/addresses run build` and `npx wrangler deploy --dry-run --config wrangler.bespoke-preview.toml`.
8. ★ Deploy approval → `npx wrangler deploy --config wrangler.bespoke-preview.toml`.
9. Smoke tests:
   - a request with a live key must return 503
   - the owner dashboard against the preview Worker
   - Stripe test cards:
     - success `4242 4242 4242 4242`
     - decline `4000 0000 0000 0002`
     - 3-D Secure `4000 0025 0000 3155`
   - abandon checkout and wait 30 minutes
   - resend a webhook from the Stripe dashboard
   - owner cancel during checkout
   - accept a reviewed payment
   - the calendar retry button (if a test calendar is used)
10. ★ Go/no-go review; then delete or keep the preview resources.
