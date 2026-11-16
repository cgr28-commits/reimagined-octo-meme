# Bespoke quotes: Phase 3 payment design and failure-recovery plan

Status: **design only.** No checkout route exists yet. `finalize-paid-checkout.ts` and all shared payment code are untouched. Implementation needs explicit approval.

## Approved business rules

- Bespoke Event Transfer and Business Class bookings appear in the existing Jobs and Calendar.
- A new bespoke booking confirmation email is used. Existing airport emails stay unchanged.
- **Charge immediately:** no Stripe card hold (`manualCapture: false`) for bespoke quotations.
- Refunds remain manual.
- Existing airport bookings, SumUp, Stripe and payment settings are preserved. The provider choice stays with the existing `createHostedCheckout` / `PAYMENT_PROVIDER`.

## Safety invariants (each becomes a test)

| # | Invariant |
|---|---|
| I1 | A customer is never charged twice for one quotation version. |
| I2 | A successful payment is always recorded in the bespoke Durable Object (DO), even if booking creation fails. |
| I3 | CONFIRMED only after the booking record exists (`system_mark_booked` requires PAID and a booking reference; already enforced). |
| I4 | Expired, cancelled, declined, wrong-amount, unexpected-checkout, vehicle-unavailable or duplicate payments go to owner review. Already enforced by `system_record_payment`. |
| I5 | The amount always comes from the DO quote, never from the browser. |
| I6 | No refund is ever issued automatically. |

## What exists today (verified in code)

- **DO state machine** (Phases 1–2, tested):
  - `system_begin_payment`: one attempt per quote version; a repeat returns the same attempt.
  - `system_attach_checkout`: a conflicting checkout id is refused.
  - `system_release_payment_attempt`: refused once a payment is recorded for that checkout.
  - `system_record_payment`: always records; idempotent per payment reference; routes to review.
  - `system_mark_booked`.
  - The expiry sweep never expires a quote with a checkout in progress.
- **Existing checkout creation, `createHostedCheckout()`:**
  - **Stripe:** `createStripeCheckoutSession()` sends an `Idempotency-Key` of `checkout:<checkoutReference>:<hourBucket>:<paramsHash>`. Same reference and parameters in the same hour returns the same session. Sessions expire about 23 hours after creation.
  - **SumUp:** a duplicate `checkout_reference` returns 409 `DUPLICATED_CHECKOUT` (`isDuplicateSumUpCheckoutError`). An existing checkout can be found with `listSumUpCheckoutsByReference()`.
- **Existing finalisation:** `finalizePaidCheckout()` runs `finalizePaidCheckoutOnce` inside a per-checkout Durable Object claim (`runPaymentOperation`, key `payment-finalize:<hash(checkoutId)>`). Browser confirmation and webhook (Stripe `checkout.session.completed` → `/payments/webhook?checkout_id=…`) therefore cannot both finalise one payment.
- Stripe sessions can be expired with `expireStripeCheckoutSession()` and read with `retrieveStripeCheckoutSession()`.

## Proposed flow

### A. Customer clicks "Accept and pay" on `/quotation/`

`POST /bespoke-quotes/checkout { token }`. This is new, bespoke-only, flag-gated, Turnstile-free (the token is the credential) and rate-limited.

1. Resolve the token and check its hash (existing).
2. **DO `system_begin_payment`** (`quoteVersion`, new `attemptId`, `tokenHash`):
   - `existing_attempt` with a `checkoutId` → return that checkout's payment URL. **No new checkout (I1).**
   - `existing_attempt` without a `checkoutId` → crash-recovery path (section C).
   - `new_attempt` → continue.
3. **Deterministic reference:** `checkoutReference = bq-<reference>-v<quoteVersion>-<attemptId>`. It is stored in the attempt *before* any provider call.
4. `createHostedCheckout()` with:
   - amount = the DO attempt amount (I5)
   - `manualCapture: false` (charge immediately)
   - metadata `{ bespoke_reference, quote_version, attempt_id }`
   - the redirect back to `/quotation/`
5. Save the pending-checkout record (existing store, plus a new optional field `bespokeQuoteReference`, an additive type change), then **DO `system_attach_checkout`**.
6. Return the payment URL.

### B. Payment completes (webhook or browser return)

Needs the separately approved shared change: **one early hand-off** in `finalizePaidCheckoutOnce`. When the pending record has `bespokeQuoteReference`, call a new `finalizeBespokeCheckout()` in a new file. This runs inside the existing per-checkout claim. Airport bookings never reach that branch.

`finalizeBespokeCheckout()`:
1. Confirm PAID with the provider (existing `getSumUpCheckout` / `getStripeCheckoutAsSumUp`) and read the **provider-reported amount**.
2. **DO `system_record_payment`** (`paymentReference`, `checkoutId`, provider amount). **Always first (I2).**
3. Outcome `review` → owner alert email. **Stop.** No booking, no customer confirmation, no refund (I4, I6).
4. Outcome `accepted` (status PAID):
   - a. Create the booking job through the existing paid-booking store (`savePaidBookingRecord`, booking reference counter, calendar) with source `bespoke`. Keyed by `checkoutId`, so a retry finds the existing record.
   - b. **DO `system_mark_booked`** with the booking reference. CONFIRMED only now (I3).
   - c. Send the **new** bespoke confirmation email (once-only notification key `confirmation:v<version>`) and the owner alert.
5. Outcome `duplicate_callback` → return the stored result (idempotent).

### C. Partial failures and recovery

| Crash / failure point | State left behind | Recovery |
|---|---|---|
| After begin, **before** the provider call | Attempt (no checkout id) | Customer retries → `existing_attempt` without checkout → call the provider again with the **same** `checkoutReference`. Stripe: the idempotency key returns the same session within the hour. SumUp: 409 duplicate → `listSumUpCheckoutsByReference` → reuse. Never a second checkout. |
| **After checkout created, before its id is stored** (the case you asked about) | Provider has a checkout; the DO attempt has the reference but no id | Same as above: the deterministic reference finds it (Stripe idempotency within the hour; SumUp by reference). If the customer paid it anyway, the webhook arrives with a checkout id the DO doesn't know. To cover this, step B looks up the bespoke reference from the **provider metadata / `client_reference_id`** when the pending record is missing, then records the payment. With no attached checkout this gives `unexpected_checkout` → **owner review** (money recorded, nothing auto-confirmed). |
| Stripe hour boundary passed during recovery | The Stripe idempotency key changes, so a new call would make a 2nd session | Before any new call, if the attempt is older than 50 minutes: **expire** the old session (`expireStripeCheckoutSession`). If expiry fails because it was completed, retrieve it and record the payment instead. Only then release the attempt and start a new one. |
| Pending record saved, attach failed | Provider + pending know the checkout; the DO doesn't | Finalisation finds `bespokeQuoteReference` in the pending record and records the payment. `unexpected_checkout` → review. The customer is never charged twice: a repeat click re-runs attach with the same id. |
| Payment recorded, booking creation fails | DO: PAID, payment stored | Finalise returns a retryable error. The webhook retry or the sweep re-runs step 4a, which is idempotent by checkout id. The owner sees "Paid — booking to be created". **Money is never lost.** |
| Booking created, `mark_booked` fails | Booking exists; DO still PAID | Retry finds the booking by checkout id and calls `mark_booked` again (idempotent for the same reference). |
| Confirmation email fails or outcome unknown | CONFIRMED | Notification log shows failed/unknown. The owner resends deliberately (Phase 2 mechanism). |
| Customer abandons checkout | PAYMENT_STARTED, attempt expired | Sweep (flagged list) checks the provider. **Paid** → record. **Not paid** → Stripe: expire the session first, then release; SumUp: release after the checkout is no longer payable. Then EXPIRED or QUOTED. |
| Owner cancels while at checkout | CANCELLED (attempt kept) | Expire the Stripe session immediately (best effort). If payment still lands → `paid_after_cancellation` review. |
| Provider outage at creation | Attempt without checkout | Release the attempt and show "try again shortly". No charge possible. |

### D. Not changed

Airport calculator and pricing, Business Class instant pricing, airport emails and WhatsApp, A2A, personal quotes, short notice, refunds, Stripe holds for airport bookings, SumUp configuration.

## Shared-code change list (for the separate approval)

1. `workers/addresses/src/pending-checkout-store.ts`: add optional `bespokeQuoteReference?: string` to the record type (additive).
2. `workers/addresses/src/finalize-paid-checkout.ts`: one early `if (pending?.bespokeQuoteReference) return finalizeBespokeCheckout(...)` inside `finalizePaidCheckoutOnce`, **before** any airport booking logic. No other line changes.
3. Payment webhook handler: when no pending record exists, look up `metadata.bespoke_reference` (Stripe) or a reference prefix of `bq-` (SumUp) and route to `finalizeBespokeCheckout`. *This is the only path that touches the existing webhook function; it can be deferred, with owner review covering that case manually.*

Everything else lives in new bespoke files.

## Test plan

**Automated** (in-process; providers mocked; fake DO with forced interleaving, as in Phases 1–2):
- 20 concurrent "Accept and pay" → exactly one provider checkout call (I1).
- Crash injection at every row of table C → no second checkout. Payment recorded once; never CONFIRMED without a booking.
- Webhook + browser confirmation at the same time → one payment, one booking, one confirmation email.
- Paid after expiry, after cancellation, after vehicle marked unavailable, wrong amount, unknown checkout → review, no booking, no customer confirmation, no refund call.
- Second payment on a confirmed quote → review, still CONFIRMED.
- Booking-store failure after payment → PAID kept, retry creates exactly one booking.
- Stripe hour-boundary recovery → old session expired before a new one.
- SumUp 409 duplicate → existing checkout reused.
- Amount always from the DO, not the request body.
- Regression: all existing payment checks: `check:stripe-payments`, `check:stripe-hold-refund`, `check:refund-ops`, `check:refund-prod-readiness`, `check:quote-path-fare-parity`, `check:quote-authoritative-fare`, `check:saved-quote`, `check:quick-quote`, plus the airport finalisation scripts.

**Preview** (Stripe test mode, after the preview is approved; see the preview doc):
- Test cards: success `4242…`; declined `4000 0000 0000 0002`; 3-D Secure `4000 0025 0000 3155`.
- Abandon checkout, then run the sweep.
- Webhook delivered twice (resend from the Stripe dashboard).
- Owner cancel during checkout.

**Live:** not until a separate go/no-go.

---

## Implementation notes (Phase 3, as built)

- **Stripe only.** The owner confirmed "I only use Stripe now".
  - Bespoke checkout calls `createStripeCheckoutSession` directly (`manualCapture: false`, charge immediately).
  - It never calls `createHostedCheckout` and never falls back to SumUp. If Stripe is not active for the customer, the quotation page shows "contact us".
  - SumUp-specific recovery (duplicate-reference lookup, deactivate) was dropped.
  - Existing airport SumUp code is unchanged.
- **Checkout** (`POST /bespoke-quotes/checkout`):
  - The DO attempt is created first, with checkout reference `bq-<ref>-v<version>-<attemptId>`.
  - Session creation runs inside the existing `runPaymentOperation` claim, keyed by that reference.
  - Then the pending record is saved (`checkoutKind: "bespoke"`), then the checkout is attached.
- **Payment return** (`POST /bespoke-quotes/payment-status`) and the Stripe webhook both go through the shared `finalizePaidCheckout` → hand-off → `finalizeBespokeCheckout`.
- **Booking:**
  - steps: paid booking record (MAT reference) → tracking job (Jobs) → Google Calendar (once) → notes → `system_mark_booked` (CONFIRMED)
  - then the new confirmation email and an owner alert, each once
  - The record has `isAirportTrip: false` and no airport code.
- **Recovery:**
  - The 5-minute sweep reconciles timed-out checkouts with Stripe: paid → finalised; unpaid → session expired, then released. An unknown session is released only after 24 h.
  - The sweep also retries any PAID request whose booking creation failed, until it is CONFIRMED.
- The unfinished-payment job skips bespoke checkouts, because it only processes `checkoutKind: "booking"`. This matters because that job would otherwise re-price the journey with the airport engine.

### Shared code actually changed

1. `pending-checkout-store.ts` (+6 lines): `"bespoke"` kind and `bespokeQuoteReference?`.
2. `finalize-paid-checkout.ts` (+11 lines): one import and one guarded early return, placed before all airport logic.
3. `index.ts` webhook (+6 lines): `else if (isStripeCheckoutId(checkoutId)) await handleOrphanBespokePayment(...)` when there is no pending record.

Plus the bespoke wiring in `index.ts`: passing `logPaidBookingCalendar` to the bespoke routes and sweep.

### Known interactions to resolve before go-live

Two existing automations decide by **address text**, not by flags. Both would treat a bespoke booking that starts or ends at an airport as an airport transfer:

- **Return-offer emails** (`processDueReturnOffers`): could offer an airport-priced return discount on a one-way bespoke airport job.
- **Airport pickup reminder** (`shared/airport-pickup-reminder.ts`): could send the standard airport collection instructions.

Excluding them needs a fourth small shared change (e.g. skip records whose `notes` start with "Bespoke"). This is **not made, pending approval.** Until then, keep bespoke bookings away from airports, or pause automatic return offers in the owner settings, before enabling public requests.
