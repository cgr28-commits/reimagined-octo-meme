# Private Tours settings (WP-B1)

Owner-only settings store for Private Tours. **Staging only.** Code lives in `workers/tours/`; it shares nothing with the airport Worker, pricing, booking or payment code.

## What is mandatory and what is provisional

**Mandatory (safety, security, passenger capacity) – enforced by the validator, cannot be loosened by any setting:**
- Maximum four passengers (also per vehicle and in luggage rules).
- Cruise return buffers: Belfast-only at least 60 minutes, long-distance at least 90 minutes, plus the traffic contingency. Planning safeguards, not guarantees.
- Cruise all-aboard time is customer-confirmed, never inferred. The itinerary engine may never reduce the traffic contingency.
- No pick-ups outside Northern Ireland; owner-only access; mobility preferences need consent and stay out of analytics and ads; cruise tours need extra driver approval; no automatic subcontracting.
- Wording: "private local driver"; no guiding claims, no larger-vehicle or fleet wording (blocked by the validator).

**Provisional (owner-configurable commercial settings, each `{ value, provisional }`):**
- Traffic contingency minimum: 30 minutes provisionally. The future engine may increase it where verified conditions require; the effective value is never below the configured minimum (`effectiveReturnBufferMinutes`).
- Finance, each independent: vehicle running cost (£0.38/mile, provisional), payment processing fee (percent and fixed), administrative cost, advertising acquisition cost, self-driving hourly earnings target, plus margin floor, paid-driver hourly and subcontractor ceiling. Unknown inputs are `null` (unconfigured); profitability then reports exactly what is missing and never guesses. No airport profitability setting is read or inherited.
- Tours (six provisional entries), durations, miles, cancellation, quote validity and hold, working hours, pick-up zones, retention, drivers and operating models.

**Launch gates** (insurance, licensing, cancellation legal review, ICO, harbour pick-up access, photo licensing, competitor benchmark, pricing approval, guiding qualifications, advertising approval, routing provider) start closed. A gate opens only with a recorded evidence reference. While any gate is closed nothing can be bookable, instant-booking, advertised or publicly launched.

## Availability
Synthetic staging fixtures only (`synthetic-staging-fixture`). Any other source is rejected. WP-B1 performs no live availability reads or writes and has no KV binding.

## Storage and API (Durable Object, one per staging Worker)
- Immutable numbered versions, each with an integrity hash: SHA-256 over canonical JSON of `{version, settings}` (`getSnapshot`/`verifySnapshot` logic in `src/canonical.js`). Quotes should store the complete snapshot, version and hash.
- Append-only audit log (seed, publish, conflict, rejection, rollback, integrity failure) with sequence numbers.
- Optimistic concurrency: publish and rollback need `baseVersion`; a stale value returns HTTP 409 and writes nothing. Requests are serialised.
- Rollback appends a new version carrying the old settings (history is never rewritten), verifies the old snapshot hash first, and re-validates against today's mandatory rules. A reason is required.
- Owner authentication is checked server-side with a constant-time compare of digests; five failures lock a client out for 15 minutes; with no owner key configured the Worker fails closed (503). The Worker refuses to run unless `TOURS_ENVIRONMENT = "staging"`.

| Method | Path | Purpose |
|---|---|---|
| GET | /health | liveness (no data) |
| GET | /settings, /versions, /versions/:n, /audit | read |
| POST | /validate | errors and warnings, writes nothing |
| POST | /publish | `{settings, baseVersion, reason}` |
| POST | /rollback | `{baseVersion, targetVersion, reason}` |
| POST | /verify | `{version, hash?}` integrity check |

## Deployment
`deploy-tours-preview.yml` job `tours-settings` runs the unit tests and the isolation guard (including negative tests for production account, KV, routes, shared Durable Object, production Worker name and live availability bindings), then deploys `reimagined-octo-meme-tours-settings-preview` to the staging account and smoke-tests authentication, the mandatory rules, 409 concurrency and snapshot integrity. It runs only on `tours/**` pushes and manual dispatch. No production deployment, route or secret is involved. Uses `TOURS_PREVIEW_OWNER_KEY` when set; otherwise a random key is generated per deploy (smoke tests only).

## Not in WP-B1
No owner dashboard UI, itinerary engine, quote creation, booking, payment, public pages, live availability or production deployment (later work packages, each needing approval).
