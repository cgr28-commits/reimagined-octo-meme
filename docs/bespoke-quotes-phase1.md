# Bespoke quotes (Event Transfer / Business Class requests): Phase 1 backend

Status: development branch only. **Not deployed. Migration not applied. Public routes off.**

## What this is

Manually priced quotation requests for two new services:
- **Event Transfer**: transport to and from Belfast events. Up to 16 passengers. A group/7-seater can be requested but is never promised.
- **Business Class bespoke**: executive airport, corporate, VIP, special occasion and bespoke private journeys. Maximum 3 passengers, enforced on the server.

This is separate from the instant airport calculator and its automatically priced Business Class vehicle, which are unchanged. Nothing in this module calculates a fare.

## Files

| File | Purpose |
|---|---|
| `shared/bespoke-quote.ts` | Data model, server-side validation, state machine, customer-safe and owner projections |
| `shared/turnstile.ts` | Cloudflare Turnstile server-side verification (fails closed) |
| `workers/addresses/src/bespoke-quote-coordinator.ts` | `BespokeQuoteCoordinator` Durable Object (SQLite): atomic state, dedupe claims, rate limits |
| `workers/addresses/src/bespoke-quote-handlers.ts` | HTTP routes |
| `workers/addresses/src/bespoke-quote-store.ts` | KV owner-list index (read model only) |
| `scripts/check-bespoke-quote.ts` | Tests (`npm run check:bespoke-quote`) |

Wiring added to existing files:
- `workers/addresses/src/index.ts`: one class export, four optional `Env` fields, one route dispatch.
- `wrangler.toml`: one binding plus the additive `v5-bespoke-quote-coordinator` migration.
- `wrangler.local.toml`: the same, for local development.

## Storage

- **Durable Object `quote:<reference>`** is the authoritative record. Every change runs inside `blockConcurrencyWhile`, so an owner edit, a customer checkout and a payment callback can never interleave.
- Owner edits must send `expectedVersion`; a stale view gets a 409.
- Owner edits must also send an `idempotencyKey`, so a double-click replays instead of applying twice.
- **Durable Object `dedupe:<sha256>`**: the same customer and trip within 24 hours returns the same reference.
- **Durable Object `rate:<sha256>`**: fixed-window rate limits, keyed by hashed IP or email. No personal data appears in object names.
- **KV `bq:idx:<inverted time>:<reference>`**: one index key per request, with a small summary as metadata, for the owner list. It may lag by up to about 60 seconds.
- Customer link secrets are never stored, only their SHA-256 hash. The token is `<reference>.<64 hex>`. Links will carry it after `#`.

## Routes

Public routes return 404 unless `BESPOKE_QUOTES_ENABLED = "1"`, and 503 unless `TURNSTILE_SECRET_KEY` is set.

| Route | Notes |
|---|---|
| `POST /bespoke-quotes/request` | Honeypot, 5/hour per IP, Turnstile, validation, 3/day per email, dedupe. Returns the reference only. |
| `POST /bespoke-quotes/view` `{token}` | 30/hour per IP. Customer-safe view: no email, phone, notes, costs, profit or payments. |
| `POST /bespoke-quotes/decline` `{token}` | Customer declines the quote. |

Owner routes require `X-Owner-Key` and work even when the public flag is off.

| Route | Notes |
|---|---|
| `GET /owner/bespoke-quotes?category=&status=&cursor=` | List, from the KV index |
| `GET /owner/bespoke-quotes/detail?reference=` | Full record, including estimated profit |
| `POST /owner/bespoke-quotes/action` `{reference, expectedVersion, idempotencyKey, action}` | See below |

Owner action types:
- `owner_start_review`, `owner_update_availability`, `owner_set_costs`
- `owner_issue_quote`: the server mints the customer token and returns it once to the owner
- `owner_decline`, `owner_cancel`
- `owner_resolve_review`, `owner_record_manual_refund`

The `system_*` actions (begin payment, attach checkout, release attempt, record payment, mark booked, expire) are reachable only through `applyBespokeSystemAction()` inside the Worker. They are for Phase 3 and are not exposed over HTTP.

## Payment rules (built into the state machine, tested)

- **Every payment is recorded, whatever the status.** The same `paymentReference` twice is a no-op.
- A payment is accepted (status PAID) only if all of these hold:
  - the request is at checkout
  - the checkout id matches the current attempt
  - the amount matches the quote to the penny
  - the quote has not expired
  - the vehicle is not marked unavailable
- Anything else goes to **PAYMENT_REVIEW** with reasons: paid after expiry, paid after cancellation/decline, vehicle unavailable, amount mismatch, unexpected checkout, payment during review.
- A second payment on a PAID or CONFIRMED request keeps that status and opens a review. A confirmed job is never un-confirmed.
- One checkout per quote: a second "begin payment" returns the same attempt. An abandoned attempt cannot be replaced until the provider has been checked (Phase 3).
- The owner cannot re-price while the customer is at checkout. Cancelling then is allowed; if the payment still lands, it is flagged for review.
- **No refunds are issued.** "Manual refund required" and "Record manual refund" are bookkeeping steps for the owner.
- A quote can never be payable after the pickup time: its expiry is capped at the pickup time.
- CONFIRMED needs a booking reference (Phase 3 creates the booking).

## Not in Phase 1 (each needs separate approval)

- Checkout creation and changes to the shared payment finalisation code (`finalize-paid-checkout.ts` is untouched).
- Emails (customer acknowledgement, owner alert, quote email).
- Cron expiry sweep. Expiry is applied lazily when a quote is viewed.
- Owner Dashboard UI, public pages and forms.
- Data-retention rule for bespoke records. Records holding payments are never auto-deleted; a retention period still needs agreeing.

## Turnstile setup (when you approve switching public routes on)

Turnstile is free. These are owner steps in the Cloudflare dashboard; nothing has been created.

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Widget name: `My Airport Taxi NI – quote requests`.
3. Hostnames: `www.myairporttaxini.co.uk` and `myairporttaxini.co.uk`. Add `localhost` only on a separate test widget.
4. Widget mode: **Managed** (recommended; usually no click, accessible challenge when needed).
5. Copy the **Site key**. It is public and goes in the frontend build as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Phase 4/6).
6. Copy the **Secret key** and store it only as a Worker secret, e.g. `npx wrangler secret put TURNSTILE_SECRET_KEY` in `workers/addresses`. Never commit it or paste it in chat.
7. Optional: set the Worker variable `TURNSTILE_ALLOWED_HOSTNAMES` if preview hostnames need to work. The default is the two live hostnames.
8. The frontend widget must use `action: "bespoke_quote_request"`. The Worker rejects any other action.

Accessibility: Managed mode supports keyboard and screen readers. If the widget fails to load, the form will show phone and WhatsApp alternatives (Phase 4/6).

## Deploying (later, separate approval)

Merging to `main` triggers `deploy-worker.yml`, which deploys the Worker and **applies the v5 migration** (creating the new Durable Object class). That deploy needs your approval first. With `BESPOKE_QUOTES_ENABLED` unset, the public routes stay at 404 after deploy.
