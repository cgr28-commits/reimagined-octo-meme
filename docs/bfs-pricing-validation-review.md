# Precise airport quotes: approved changes in draft PR #680

No merge, deployment, live pricing-setting change, live booking, payment or email write is authorised or performed by this review.

## Root cause and corrected routing

Google provides Place Details; **OSRM provides the driving route**. The previous BFS coordinate (54.6575, -6.2158) snapped near Killead Road, not the terminal Express loop. Combined with acceptance of an unspecified whole-road Google location, this reproduced the original £56 / £67 quotes:

| Original quote | Passenger miles | £10 + £2.50/mile, rounded | Express | Total |
|---|---:|---:|---:|---:|
| Airport pickup | 16.34175 | £51 | £5 | £56 |
| Airport drop-off | 20.60193 | £62 | £5 | £67 |

The dates/times supplied were Fridays outside the configured night period. No night/weekend surcharge, return discount or binding £45 minimum explains the difference.

The approved BFS routing point is **54.6627299, -6.2173267**, verified against Google's Express parking place (`ChIJddwvFNGqYUgRs3L8NFROAXA`) and the road-accessible paid terminal loop (OSM way 1174639316; OSRM snap approximately 3.6 metres). Both directions were routed successfully. The airport's canonical ID remains unchanged (`ChIJy4dKsjJVYEgRntaoTC4U5gw`). Pickup and drop-off fees remain separate leg decisions.

The precise comparison address is the **Strand building, 152–154 Holywood Road, Belfast BT4 1NY**, Google ID `ChIJP-RzEJ0JYUgRPp5lhXiCzkQ`, 54.600569, -5.87969. These examples do not claim to reconstruct the original customer's unspecified street address. Directional routing is retained; no common/averaged tariff distance is introduced.

The private operating-base constant is corrected to Google's full-numbered-address location for **7 Glen Manor Road, Newtownabbey BT36 7FU**, 54.6658928, -5.9707823 (`ChIJB3FCrManYUgRqsSKi-05hZY`). This is verified address evidence, not a claim of a GPS-surveyed driveway. Both internal positioning and return-home calculations use this one constant. Neither leg contributes to customer pricing.

## Pricing order and administration

Owner Dashboard → Pricing → Saloon → **Belfast International Airport — Minimum Saloon Fare** (`bfsMinimumSaloonFareGbp`, default £45, editable £0–£1,000 to two decimals). Existing persistence, version-conflict checks, audit and config caching are reused. An older admin client that omits the field preserves its saved value.

1. Resolve both selected Google/canonical airport IDs and validate structured place details server-side. Route the passenger leg using OSRM.
2. Apply the existing configured tariff and existing vehicle rounding: currently £10 + £2.50 × unrounded passenger miles, with the existing general minimum.
3. At either canonical BFS endpoint, apply the configured pre-discount Saloon minimum. Estate uses the same minimum-adjusted Saloon amount plus the configured supplement (currently £7). BHD/DUB-only trips do not acquire the BFS floor.
4. For returns, apply the configured 5% discount to the base vehicle fares. Preserve the existing policy that uses the quoted outward passenger fare as the base for each return leg; each leg has its own scheduled premium and airport charge. This PR does not change that routing policy.
5. Apply existing night/weekend premiums to each qualifying undiscounted base fare. These premiums retain their existing discount treatment.
6. Add airport fixed/access fees once per relevant leg, at full value. Existing promotion rules remain in place.
7. Apply existing final-payable rounding and authoritative SumUp parity validation. Preserve pence only when a fractional BFS minimum/supplement actually binds; merely changing an unused minimum from £45 to £45.25 cannot change a higher fare.

Customer fares never acquire an hourly earnings floor, a working-time charge or positioning/home-return mileage, in **either mileage or legacy pricing mode**. The legacy `applyProfitabilityProtection` boundary now returns the existing tariff fare unchanged. Internal cost-analysis helpers, dashboard settings and stored data remain available; labels explicitly identify comparisons as analysis only. No pricing-settings migration or deletion is needed. This deliberately prevents a later pricing-mode switch from reactivating automatic earnings adjustments.

## Representative fares

Recorded road-route fixtures are in `scripts/fixtures/reviewed-airport-routes.json`. Illustrations use Friday 13 November 2026 at 12:00, return Friday 20 November at 12:00, one passenger/one suitcase, £10 + £2.50/mile, £30 general minimum, £45 BFS minimum and £7 Estate supplement. No night/weekend premium applies. Figures include existing access charges and final rounding. They are test examples, not live offers.

| Airport / direction | Passenger miles | Saloon vehicle | Estate vehicle | One-way access/fixed | Saloon total | Estate total | Return Saloon | Return Estate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| BFS → Strand | 20.11080 | £60 | £67 | £5 | **£65** | **£72** | £124 | £137 |
| Strand → BFS | 19.58406 | £59 | £66 | £5 | **£64** | **£71** | £122 | £135 |
| BHD → Strand | 2.57446 | £30 | £37 | £4 | £34 | £41 | £65 | £78 |
| Strand → BHD | 2.62144 | £30 | £37 | £4 | £34 | £41 | £65 | £78 |
| DUB → Strand | 101.62206 | £264 | £271 | £9 | £273 | £280 | £515 | £528 |
| Strand → DUB | 101.59174 | £264 | £271 | £4 | £268 | £275 | £515 | £528 |

Dublin's existing £9 pickup and £4 drop-off fixed charges explain its £5 directional difference in these examples. They remain unchanged. Return access/fixed totals are £10 BFS, £8 BHD and £13 DUB, excluded from the discount. At a binding £45 BFS floor, one-way Saloon/Estate totals are £50/£57; daytime returns are £96/£109 after the existing whole-pound final rounding.

## Location validation and payment consistency

- Shared structured validation rejects street-only, postcode, city, intersection and geographic-area selections. Full numbered addresses and individual premises, hotels and businesses remain valid. Airport selection uses the existing canonical catalogue.
- Every manual edit invalidates the selected ID and coordinates immediately. Old suggestions and outstanding prediction responses are invalidated too, so a result from the previous query cannot be tapped during the debounce period. Late Place Details responses cannot reinstate an edited selection.
- Quote generation requires both valid endpoints. The server resolves their IDs again and does not trust browser coordinates, place types or supplied mileage.
- Homepage, landing page, booking, owner automatic quote and saved quote paths share these checks. Historical explicitly approved fixed quotes retain their agreed-price workflow.
- Pending **and finalized paid bookings** retain the selected Place IDs and finite, server-validated coordinates. Existing records are not rewritten; new fields are optional for historical compatibility.
- Signed receipt format v3 binds this routing/pricing revision and whether minimum pence must be preserved. The browser now retains the current receipt instead of discarding it. Previous instant receipts require refresh; this does not reprice existing paid bookings.

## Verification and scope review

Isolated minimum/configuration/location/payment suite: **345 checks passed**. Initial full browser-response → signed receipt → mock SumUp → finalized-record matrix: **96 cases passed**, covering all three airports, both directions, Saloon/Estate, one-way/return, both pricing modes, and £40/£400 internal analysis targets. The expanded matrix additionally tests changed fractional minimum/supplement settings. All writes are mocked. Root static export completed for **149 pages**; Worker TypeScript and Wrangler **dry-run** build passed.

The broader regression and Chromium/WebKit CI checks are being rerun for the final commit; final status must be read from that commit's checks, not older green runs. Physical iPhone testing is separate from Linux WebKit coverage.

The original 59-file PR included 30 runtime files, 8 required worker mirrors, 17 tests/fixtures, and 4 workflow/documentation/support files. Cross-channel validation and server-authoritative routing account for its scope. Follow-up files cover the approved airport/base pins, finalized-record fields, receipt/rounding propagation, internal-only profitability boundary and integration tests. Unrelated generated sitemap/marketing mirror changes are excluded. The amendment repair is kept in a separate focused PR.

## Release and compatibility notes

- Keep this PR draft; do not merge/deploy or write live settings without owner approval.
- Release matching Worker/frontend together when approved. Older instant receipts need a fresh quote; previously paid fares remain unchanged.
- Profitability remains an internal diagnostic, not a guarantee of a particular earnings rate.
- The separate amendment bug currently causes fare-sensitive schedule/address/passenger edits to fail HTTP 422 because the old handler omitted route metrics, current pricing and vehicle/access context. Existing confirmed bookings must remain unchanged on any failed replacement quote or unsuccessful top-up.
- Existing conversational quote-assistant limitations and unrelated booking-management behaviour are not redesigned here.

## BFS minimum verification — 23 October 2026

Inspection of main `0499b79cbf161e7aa1aa1a1f67a7c5fe9b324a52` and draft PR #680 head `769d2b881bdba1a0f9ad578859b9213dfbc94511` confirmed that the requested configurable BFS minimum already exists in this draft, but is not on main. This follow-up reuses that implementation and changes only tests, their review workflow and this document. No second minimum, pricing setting or calculation path was added. PR #680 also contains its previously documented address-validation and routing changes; those remain part of the broader PR review.

The review traced the canonical airport catalogue, shared quote engine, owner settings validation/persistence, quote API and signed receipts, payment recalculation, pending checkout, verified paid confirmation, booking records and customer/owner email generation. The default is £45; `bfsMinimumSaloonFareGbp` remains editable in Owner Dashboard → Pricing → Saloon. Estate uses the configured supplement. Return discounts and airport charges retain the order documented above.

Additional coverage:

- Varying only the BFS minimum leaves BHD, DUB, LDY and ordinary journey quotes identical, for Saloon/Estate and one-way/return journeys.
- BFS ↔ BHD and BFS ↔ DUB apply the floor in both directions, with the configured supplement and return discount; airport fixed charges remain unchanged.
- The 192-case integration matrix now calls the actual paid-confirmation handler and mocked SumUp verification, instead of calling the booking-store helper directly. It checks the pending checkout, confirmation amount, finalized booking total, customer HTML/text email and owner alert against the authoritative checkout amount.
- Changing settings after checkout leaves the agreed fare unchanged. Repeating confirmation is idempotent and sends no additional emails. All external payment/email calls are intercepted; all storage is in memory.
- An existing fare-parity suite had stale direct-resolver assertions and two £44 BFS expectations. These now verify the current precise-location resolver chain, selected-place validation and £45 BFS floor, retaining all ten public/Quick Quote/Personal Quote fare comparisons and missing-route rejection checks.

Validation on this follow-up:

| Check | Result |
|---|---|
| Minimum, settings, airport identification, routing and checkout suite | PASS — 409 checks |
| Quote → SumUp → paid confirmation → record → email matrix | PASS — 192 cases |
| Owner pricing; signed receipts; open-payment fares; airport fixed/access fees; Express; night/weekend; deposit/cash; vehicle flow; quote-path parity; customer/owner emails; authoritative fare; dashboard formula | PASS — 14 regression suites |
| Frontend TypeScript | PASS |
| Worker TypeScript and Wrangler dry-run bundle | PASS |
| Frontend static production build | PASS — 149 pages |
| Lint | PASS — existing warnings |

No database migration is required: the existing settings store supplies £45 when the optional field is absent and retains saved custom values. No existing paid booking is rewritten. After owner approval, release matching Worker/frontend versions together; old instant-quote receipts must refresh. This review did not merge, deploy, change live settings, create real bookings, charge payments or send emails. Remote CI must be checked on the final published commit before release.
