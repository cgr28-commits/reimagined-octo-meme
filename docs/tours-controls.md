# Private tours: emergency controls (WP-B2)

Staging only. Lives in `workers/tours/` beside the WP-B1 settings store, in its own Durable Object (`TourControlsDO`, binding
`TOUR_CONTROLS`, migration `v2`). No availability, payment, ledger or notification integration exists in this package.

## What it can and cannot do
It governs **new private-tour enquiries and new tour payments only**. It has no concept of airport transfers, confirmed bookings,
payments already in progress, Stripe webhooks, refunds or customer booking access, and cannot block them
(`/controls/check` answers `unaffected` for those kinds). Existing tour URLs and SEO are untouched: pausing never removes a page.

## Pauses
A pause has a **scope**, an **effect**, a reason (5–500 characters) and an optional automatic resume time.

| Scope | Meaning |
|---|---|
| `{kind:"all"}` | every private tour |
| `{kind:"tour", tourId, variantId?}` | one tour, or one variant (e.g. Antrim Coast `full-day`) |
| `{kind:"date", from, to}` | tours **scheduled** on those dates, inclusive, **Europe/London** dates (a UTC/offset instant is converted; 23:30Z on 1 June is 2 June) |
| `{kind:"cruise", cruiseScope}` | `all` cruise tours, `belfastOnly` (Cruise Express) or `longDistance` (Cruise Causeway) |

| Effect | Meaning |
|---|---|
| `enquiries` | **manual-review mode**: enquiries are still accepted, but no automatic quote and no availability reservation |
| `payments` | no **new** payments |
| `both` | both of the above |

Unknown details match conservatively: a missing date matches a date pause; a missing variant matches a variant pause.

## Provisional limits (configurable, audited)
`maxRangeDays` 366, `maxAutoResumeDays` 90, `maxOverrideHours` 72. Change with `POST /controls/limits`; new limits apply to new
pauses only.

## Decisions (authoritative, server-side)
- **Enquiry**: always accepted. Under a matching `enquiries`/`both` pause: `manualReview:true, autoQuote:false, reserveAvailability:false`.
- **New payment** is allowed only if **every** mandatory flag is `true` (`launchGatesPassed`, `availabilityConfirmed`, `safetyApproved`, and for
  cruise tours also `cruiseRequirementsMet`; a missing flag counts as false), the tour is known, and no matching `payments`/`both` pause is active.
- **Owner override**: an unpaid quote may start a new payment during a pause only with an owner override created for that specific
  quote (`POST /controls/override`, reason required, ≤72 h, revocable, audited). It lifts only open-ended **all-tour or single-tour**
  pauses. **Date pauses and cruise pauses are never overridable**, and every mandatory flag still applies.
- **Automatic resume** is computed at decision time. An expired pause stops applying; every other pause keeps applying, and mandatory
  flags are independent, so automatic resume (or resuming one pause) can never lift another pause or a safety gate.
- **Fail-safe**: if the state cannot be read, fails its hash check or is structurally invalid, `/controls/check` returns
  `failSafe:true`: enquiries accepted for manual review, new payments blocked. Writes are refused (503). It never fails open and never
  touches existing bookings or airport work.

## Concurrency, atomicity, audit
Every change is a new immutable version `{version, controls, hash}` (SHA-256 over canonical JSON). Writes need `expectedVersion`;
a stale value gets **409** and changes nothing (the conflict is audited). The version, current pointer, audit entry and notification
intents are written in **one** storage transaction (proved by fault injection at every write). The audit log is append-only with
contiguous sequence numbers; there is no edit or delete route.

## Notifications (reserved)
Pause, resume and override events queue **notification intents** (`channels: ["dashboard","push"]`, `delivered:false`) in the same
transaction. Reasons are not placed in push text. Nothing is sent: delivery uses the existing notification mechanism in its own package.
`GET /controls/notifications` shows the queue (`delivery: "not-integrated"`).

## Ledger reservation pause (reserved)
`ledgerReservationPause` exists in the document and must be `null`; the tour-reservation pause is built with the ledger package.

## Routes
Public: `GET /status` (cached 30 s, **informational only**: per tour `open`, `limited` or `enquiry-only`; no reasons, ids, dates or
audit; an unreadable state shows every tour `enquiry-only` with `degraded:true`). Server-side checks govern every critical action, never this.

Owner (Bearer `TOURS_OWNER_KEY`, same lockout rules as WP-B1): `GET /controls`, `/controls/versions`, `/controls/versions/:n`,
`/controls/audit`, `/controls/notifications`; `POST /controls/pause`, `/resume`, `/override`, `/override/revoke`, `/limits`, `/check`.

## Verified in CI
Unit tests (`test/controls.test.js`) and the staging smoke test: public status, 401 without the key, pause, stale 409, payment
blocked, other tour unaffected, refund unaffected, status reflects pause, resume, payment allowed, audit entries. The smoke pause
auto-resumes after 10 minutes so a failed run cannot leave it active.

## Contract for later integration packages
These rules bind the payment, availability/reservation, ledger, notification and booking-page packages. They exist so that the controls
cannot be bypassed by caching or by a convenient shortcut.

1. **Recheck immediately before the transaction.** Anything that starts a new tour payment, issues a quote automatically, or reserves
   availability must ask the controls (`POST /controls/check`, or the same evaluator in-process) **immediately before** initiating that
   step, in the same request that performs it. Every decision carries `decidedAt`, `cacheable:false` and `recheckBeforeTransaction:true`:
   never store it, reuse it across requests, or act on one obtained before a user-facing delay (form filling, redirect, 3-D Secure wait).
   Never rely on the public `GET /status` (cached, informational) or on a client-side value for any critical action.
2. **Fail closed.** If the check cannot be reached, times out or returns anything other than a valid decision, treat it as
   `failSafe`: new payments are not started and enquiries go to manual review. (A reachable but unreadable store already answers this way.)
3. **Mandatory flags come from authoritative sources.** The caller supplies `launchGatesPassed` (settings launch readiness),
   `availabilityConfirmed` (the authoritative availability check at that moment), `safetyApproved`, and for cruise tours
   `cruiseRequirementsMet` (all-aboard return buffer, harbour pickup access and itinerary scope validated by the settings engine).
   A missing flag is blocked. Owner overrides and automatic resume never satisfy a flag.
4. **Overrides.** An override is for one quote, expires, is audited and lifts only open-ended all-tour or single-tour pauses. Date and
   cruise pauses are never overridable. An override is not a licence to skip step 1 or step 3.
5. **Reservations (ledger package).** The ledger's tour-reservation pause is built there (`ledgerReservationPause` is reserved and must be
   `null` until then). Creating a reservation must follow step 1, and honour `reserveAvailability:false` / `manualReview:true`.
6. **Never affected** (`UNAFFECTED_KINDS`): confirmed bookings, payments already in progress, Stripe webhooks, refunds and
   `customer-booking-access`. Webhook and refund handlers must not call the controls to decide whether to proceed.
7. **Pages and SEO are untouchable.** A pause, including a global one, must not change a tour page's URL, return a status other than
   HTTP 200, redirect it, add `noindex`, change canonical links or sitemaps, or remove the page. A pause may only change what the page
   offers (for example an "enquire for availability" notice in place of an instant quote) based on the informational `/status`, while the
   server-side check still governs the real action.
8. **Notifications.** Deliver the queued intents through the existing mechanism in its own package; mark them delivered there. Keep reasons
   out of push text.
