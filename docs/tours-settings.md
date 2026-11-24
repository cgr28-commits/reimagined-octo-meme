# Private Tours settings (WP-B1)

Owner-only settings store for Private Tours. **Staging only.** Code lives in `workers/tours/`; it shares nothing with the airport Worker, pricing, booking or payment code. Schema: `tour-settings/2`.

## Mandatory constraints versus provisional settings

**Mandatory (safety, security, passenger capacity), enforced by the validator, cannot be loosened by any setting:**
- Maximum four passengers (also per vehicle and in luggage rules).
- Cruise return buffers: Belfast-only at least 60 minutes, long-distance at least 90 minutes, plus the traffic contingency. Planning safeguards, not guarantees.
- Cruise all-aboard time is customer-confirmed, never inferred. The itinerary engine may never reduce the traffic contingency.
- No pick-ups outside Northern Ireland; owner-only access; mobility preferences need consent and stay out of analytics and ads; cruise tours need extra driver approval; no automatic subcontracting.
- Wording: "private local driver"; no guiding claims; no larger-vehicle or fleet wording (blocked by the validator).

**Provisional (owner-configurable, each `{ value, provisional }`):**
- Traffic contingency minimum: 30 minutes provisionally. The engine may raise it, never lower it (`effectiveReturnBufferMinutes` = long-distance 90 + max(configured, engine)).
- Finance inputs, each independent: vehicle running cost (38p/mile, provisional), payment processing fee (percent and fixed), administrative cost, advertising acquisition cost, self-driving hourly earnings target, margin floor, paid-driver hourly rate, subcontractor percentages. Unknown inputs are `null` and profitability lists what is missing; it never guesses. No airport profitability setting is read or inherited.
- Quote validity and hold, working hours, cancellation tiers, pick-up zones, retention, drivers.

## Launch gates: mandatory prerequisites versus optional features

Every gate starts closed and opens only with a recorded evidence reference.

| Class | Gates | Effect while closed |
|---|---|---|
| Mandatory launch prerequisites | insuranceVerified, licensingVerified, cancellationLegalReview, icoRegistrationOrExemption, photoLicensing, competitorBenchmark, pricingApproval | Nothing can be bookable, instant-booking, or publicly launched |
| Optional feature gates | advertisingApproval (tour ads/conversions), guidingQualifications (guiding claims), harbourPickupAccess (cruise tours), routingProvider (custom itineraries) | Block only their own feature, and only while that feature is **enabled** |

So ordinary private-driver tours can launch with all four feature gates closed provided those features stay off. Enabling a feature (e.g. `tourAdsEnabled`, `guidingClaimsAllowed`, an active cruise tour, `customItinerariesEnabled`) while its gate is closed is rejected, and blocks `publicLaunch`. `GET /readiness` reports `launchReady`, the closed mandatory prerequisites and which enabled features are blocking. Classification of harbourPickupAccess and routingProvider as feature gates (not mandatory) is a decision for the owner to confirm.

## Tours, prices and variants

- Existing slugs and published prices are preserved: giants-causeway £395, belfast-city £195, game-of-thrones £395, antrim-coast from £195.
- Agreed provisional prices (pence, flagged provisional until the pricingApproval gate): Giant's Causeway 44500, Game of Thrones 44500, Antrim Coast full day 42500, Belfast City 24500, Cruise Express 29500, Cruise Causeway 49500. The Antrim half-day price is not agreed and stays unconfigured. The two cruise tours have no slug or published price yet, and their cruise scope (Belfast-only or long-distance) is unset until the owner chooses.
- Cancellation: full refund 48 hours or more before, 50% between 24 and 48 hours (agreed tier). The cancellationLegalReview gate is still closed.
- Durations, mileage and home positioning are genuinely unapproved and stay unconfigured.
- **Variants.** A tour with half-day and full-day options is ONE product (one slug) with `variants` (`half-day`, `full-day`, each at most once). Price, duration, mileage, positioning and bookability are set per variant; the tour-level figures must then be empty, and the tour's published "from" price must equal its cheapest variant. A second tour with an existing slug is rejected as a duplicate product. Antrim Coast is seeded this way (half-day £195, full-day £395 published).

## Profitability (`profitability(settings, tourId, model, variantId)`)

Home-to-home: every job includes positioning (home to first pick-up and last drop-off to home). Positioning miles are charged at the vehicle running cost and positioning hours count as working time (and count toward the maximum working day). Missing positioning keeps the result unconfigured rather than assuming zero.

| Model | Vehicle cost | Labour |
|---|---|---|
| owner | business vehicle, all miles | none; hourly earnings reported against the target over all working hours |
| paidDriver (supplied vehicle) | business vehicle, all miles | hourly wage x working hours |
| subcontractorOwnVehicle | none (their vehicle) | ceiling % of price covers vehicle and time |
| subcontractorSuppliedVehicle | business vehicle, all miles | fee % of price (unconfigured until set) |

A margin below the floor is rejected unless an owner override with a reason is recorded for that tour, model and (where relevant) variant.

## Availability
Synthetic staging fixtures only (`synthetic-staging-fixture`). Any other source is rejected. No live availability reads or writes and no KV binding.

## Storage and API (one Durable Object per staging Worker)
- Immutable numbered versions with an integrity hash: SHA-256 over canonical JSON of `{version, settings}` (`src/canonical.js`). Quotes should store the full snapshot, version and hash.
- Append-only audit log (seed, schema-upgrade, publish, conflict, rejection, rollback, integrity failure).
- Optimistic concurrency: publish and rollback need `baseVersion`; stale gives HTTP 409 and writes nothing. Requests are serialised.
- Rollback appends a new version, verifies the old snapshot hash first, and re-validates against today's rules (so an old-schema version cannot be restored). A reason is required.
- Schema upgrade: if the stored current version has an older schema, a freshly seeded version is appended (staging data is synthetic; earlier versions are kept).
- Owner authentication is server-side, constant-time on digests; five failures lock a client out for 15 minutes; with no owner key configured the Worker fails closed (503). The Worker refuses to run unless `TOURS_ENVIRONMENT = "staging"`.

| Method | Path | Purpose |
|---|---|---|
| GET | /health | liveness (no data) |
| GET | /settings, /readiness, /versions, /versions/:n, /audit | read |
| POST | /validate | errors and warnings, writes nothing |
| POST | /publish | `{settings, baseVersion, reason}` |
| POST | /rollback | `{baseVersion, targetVersion, reason}` |
| POST | /verify | `{version, hash?}` integrity check |

## Deployment
`deploy-tours-preview.yml` job `tours-settings` runs the unit tests and the isolation guard (with negative tests for production account, KV, routes, shared Durable Object, production Worker name, non-staging flag and availability bindings), deploys `reimagined-octo-meme-tours-settings-preview` to the staging account and smoke-tests authentication, mandatory rules, 409, readiness, seeded prices and snapshot integrity. Runs only on `tours/**` pushes and manual dispatch. Uses `TOURS_PREVIEW_OWNER_KEY` when set, otherwise a random per-deploy key (smoke tests only).

## Investigation: the initial staging HTTP 500
What is known: on the first deploy (run for commit 12adc53d) `/health` returned 200, then the unauthenticated `GET /settings` returned 500 about 0.6 seconds after `wrangler secret put` had created a new Worker version. The next deploy of the same code passed every smoke test. The failing path (auth check before any settings are read) does not run the seed or validator code, and 47 local tests cover it, so a logic fault in this code is unlikely. The response body was not captured, and the Durable Object exception was not logged.
Most likely cause (unconfirmed): a transient Durable Object reset while the new Worker version and secret propagated on a brand-new namespace. **Remaining uncertainty:** it is a hypothesis, not proven.
Changes made: the Durable Object now returns and logs a structured internal error; the smoke test retries only 5xx responses (up to six times, five seconds apart), prints each 5xx body and reports the retry count in the job notice. A persistent 5xx still fails the job. If a retry is ever reported, its body will identify the cause.

## Not in WP-B1
No owner dashboard UI, itinerary engine, quote creation, booking, payment, public pages, live availability or production deployment.
