# Bespoke quotes: Phase 2 (Owner Dashboard, notifications, expiry)

Status: development branch only. **Not deployed. Migration not applied. Public routes off.**

## What was added

### Owner Dashboard → More → Event & Business Class

Existing dashboard and sign-in; the owner key is sent in the `X-Owner-Key` header only.

- **List:** filters for category (All / Event Transfer / Business Class) and for "New & outstanding" / Closed / All. Payment-review badge. Quoted amount and expiry.
- **Detail:**
  - Customer and journey details.
  - Driver/vehicle availability (private).
  - Estimated driver and other costs, internal notes and profit (private).
  - Manual quotation price, validity (24 h / 48 h / 7 days or custom hours, never beyond pickup) and customer message.
  - Send / update quotation; resend with a new link.
  - Decline and cancel.
  - Payment review (accept payment, or mark manual refund required).
  - Manual refund recording.
  - Notifications log and full history.
- Each click sends a fresh idempotency key and the record version. A stale view gets "changed elsewhere" and the panel refreshes.

### Emails (new templates in `shared/bespoke-quote-emails.ts`; existing emails untouched)

| Email | Sent when | Key (once only) |
|---|---|---|
| Customer acknowledgement | A new request is stored | `ack` |
| Owner new-request alert | A new request is stored | `owner_new` |
| Customer quotation | Owner sends or updates a quotation | `quote:v<version>` |
| Resent quotation (new link) | Owner clicks Resend | `quote:v<version>:resend-<click key>` |
| Quotation expired | QUOTED → EXPIRED (sweep, or lazily when viewed) | `quote:v<version>:expired` |

How duplicates are prevented:
- Every key is claimed atomically in the request's Durable Object before sending. Retries, double-clicks, duplicate submissions and overlapping cron runs find the claim and send nothing.
- Resend also gets the key as its `Idempotency-Key`, so the provider deduplicates for 24 hours.
- A send that fails cleanly is logged as `failed`; it is not retried automatically, and the owner can resend.
- A send that throws mid-flight stays `sending`, i.e. outcome unknown. It is never retried automatically, because the email may have gone.
- Customer emails go through Resend only, with no hidden owner BCC, so quotation links aren't copied into other mailboxes. The owner alert uses the existing operational-email chain.
- Customer emails are **skipped** while `BESPOKE_QUOTES_ENABLED` is not `"1"`.

### Customer quotation page `/quotation/`

- Static, `noindex`, `no-referrer`, disallowed in `robots.txt`, not in the sitemap, not linked anywhere.
- Reads the token from `#t=…`, keeps it in sessionStorage for that tab, and removes it from the address bar.
- Shows only the customer's own journey and quotation, plus a decline button.
- Online payment is Phase 3. Until then the page says "contact us to accept".
- With the public flag off, every link shows "not available".

### Expiry sweep

- Runs on the existing 5-minute cron, **only when `BESPOKE_QUOTES_ENABLED = "1"`**, in its own `waitUntil` with its own catch, so it can't affect other cron jobs.
- Open quotations are tracked in a `registry:open-quotes` Durable Object instance, so there is no KV listing every 5 minutes.
- The request's own Durable Object decides the outcome. If the customer is at checkout (`PAYMENT_STARTED`), the sweep **never** expires the quotation. It is flagged as awaiting a payment check (Phase 3) and isn't retried every run.

## Owner-key-in-URL findings

1. **What happens:**
   - `workers/addresses/src/driver-auth.ts` → `readProvidedDriverKey()` accepts the owner or driver key from a `?key=` query parameter as well as from the `X-Owner-Key` / `X-Driver-Key` headers.
   - Every owner and driver endpoint inherits this.
2. **Where the dashboard puts keys in URLs** (`src/lib/tracking-api.ts`):
   - The helper `driverQueryKey()` and explicit `?key=` URLs add the key to about 15 Worker calls. These include the very first dashboard call, `/driver/status`, and also `/driver/jobs`, `/driver/sharing`, `/driver/journey`, `/driver/assignment`, `/driver/location`, `/driver/bookings/update`, `/paid-bookings/ensure-tracking`, `/owner/profile`, `/driver/assign` and `/driver/deassign`. Most of these **also** send the key in a header, so for them the URL copy is redundant.
   - **Four GET calls authenticate ONLY through the URL** (their headers carry no key): `/driver/vehicle/profiles`, `/driver/vehicle` (GET), `/driver/roster` and `/driver/location-history`. Removing URL-key support before fixing these would break those dashboard features.
3. **Why it matters:**
   - Query strings are recorded in Worker observability logs (enabled in `wrangler.toml`), in any proxy or monitoring that logs URLs, and potentially in error reports.
   - The owner key there is a full admin credential.
4. **Other uses of a `key` parameter:**
   - `owner-inbox-handlers.ts` uses `?key=` for a **thread id**, not a credential. Because of (1) it would be *tried* as an auth key when no header is present; this isn't exploitable, but it is confusing.
   - `quick-quote-handlers.ts` reads `?key=` only as rate-limit material.
   - The driver portal's `?access=` one-time link is read and stripped from the address bar, so it is lower risk.
5. **New Phase 2 code:** the bespoke owner routes **refuse any request carrying `?key=`** (HTTP 400), even with a valid header. The new client code never puts the key in a URL. Tests cover this.

**Safest removal plan** (each step needs separate approval):
1. *Front end only, no behaviour change:* add the auth header (`driverGetHeaders`) to the four URL-only GET calls, then stop adding `?key=` (`driverQueryKey()` and the explicit `?key=` URLs) in `tracking-api.ts`. Deploy the site. The Worker still accepts both forms at this point, so nothing breaks, including cached older pages.
2. *Measure:* add a Worker log counter for requests that authenticate **only** through `?key=` (no header). Watch for 1–2 weeks; expect zero apart from old cached pages.
3. *Remove:* delete the `urlKey` fallback in `readProvidedDriverKey()`. Rename the inbox thread parameter to `?thread=`, keeping `?key=` for that one route during the transition.
4. *Rotate* `OWNER_ACCESS_KEY` and `DRIVER_ACCESS_KEY`, because they have travelled in URLs. Sign in again on the dashboard and driver phones.

## KV minimisation

- The KV owner-list index (`bq:idx:*`) now holds only:
  - reference, category and status
  - created/updated times
  - **first name + last initial** (e.g. "Jane D.")
  - date, time and passengers
  - event title or service type
  - review flag, quoted amount and expiry
- **No email, phone, address or full surname.** Tests check this.
- Full customer details exist only in the request's Durable Object, which only the owner routes and Worker internals can read.
- Customer details also exist in:
  - the owner alert email (bookings mailbox)
  - the customer's own emails
  - the email provider's logs (Resend), which follow the provider's retention

## Proposed data-retention policy (for approval; nothing is deleted yet)

| Record type | Keep full details | Then |
|---|---|---|
| Rate-limit / duplicate-check instances | 1 hour / 24 hours | Already deleted automatically (no personal data in them) |
| Requests never quoted, or declined/cancelled with **no payment** | 90 days after the later of closure and the requested travel date | Anonymise: remove name, email, phone, addresses and free text. Keep category, dates, passengers and status for statistics |
| Quoted but unpaid (expired, or declined by the customer) | 12 months after closure (repeat requests, enquiries) | Anonymise as above |
| **Any record with a payment** (confirmed, refunded, reviewed) | 6 years after the end of the financial year of the journey (HMRC accounting records) | Anonymise contact details. Keep payment references, amounts and refund notes |
| Owner costs, profit and internal notes | Same as the record | Removed with the record's personal data |
| Notification log | Same as the record | Removed with the record |
| KV index entries | Expire automatically after 400 days (already set) | Rebuilt from the Durable Object if needed |

Implementation proposal (not built):
- A monthly job that first produces a **dry-run report** of what would be anonymised.
- Anonymisation runs only after owner approval of that report.
- Anonymisation is irreversible, so it is never automatic without approval.
- The privacy policy page should then be updated to state these periods.

## Existing failing checks (investigated, not changed)

None of these runs in CI (CI runs only `check-owner-pricing.ts`, which passes). All seven fail identically on the base commit before this work.

| Check | Cause | Production impact | Blocks deploy? | Recommended fix |
|---|---|---|---|---|
| `check:stripe-payments` | Tooling: the script uses top-level `await`, and tsx compiles it as CommonJS ("Transform failed") | None. Worker typechecks; a `.mts` copy passes | No | Rename to `.mts` or wrap in `async function main()` |
| `check:stripe-hold-refund` | Same tooling issue | None. `.mts` copy passes | No | Same |
| `check:business-class-minimum` | Stale test: expects the old £10 Estate supplement (now the approved £7). It also expects Business Class minimum + airport access to total £75; the code gives £80 (access added on top of the floor) | Estate +£7 is intended. **Policy question:** should airport access sit inside the Business Class minimum? | No | Update 10→7. Owner to confirm the access-vs-minimum policy, then align test or code |
| `check:owner-pricing` (chained `check-public-minibus-capacity.ts`) | Fixture hits the BFS minimum fare, which floors Saloon/Estate but not Minibus. Test expects £80.60, code gives £79.05 | **Policy question:** should the Minibus inherit the BFS minimum? | No | Use a longer fixture, or confirm the policy |
| `check:a2a-personalised-quote` | Stale test: City Hall ↔ Boucher is now an instant Greater Belfast journey; email date format and "SumUp" wording changed | City ↔ Boucher gets an instant quote (appears intended) | No | Update expectations after the owner confirms |
| `check:short-notice-lead-expiry` | Stale source-text test: the notice moved into `QuoteCard.tsx` | None | No | Assert against `QuoteCard.tsx` |
| `check:technical-seo` | Stale source-text test: the H1 is split across two spans (same visible text); Dublin meta copy changed | None functionally | No | Update the regexes |

Also failing (not one of the seven): `check-minimum-booking-notice.ts`, which asserts on old WhatsApp help wording.
