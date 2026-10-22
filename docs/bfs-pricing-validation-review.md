# BFS pricing investigation and implementation review

Status: proposed code only; no production deployment or live pricing-setting writes. Investigated against main commit `e7ec891f6579d4cb0ff662f19f3a532b4f31e93f` and public pricing version 225, updated 22 October 2026 at 18:28:22 UTC.

## Root cause of £56 versus £67

The £11 difference is reproducible using the existing configured mileage formula. There is no directional £11 surcharge. **Google supplies the locations; OSRM/OpenStreetMap supplies the driving routes and distances.** Production takes the first OSRM driving route, without requesting alternatives or passing the trip's date/time. A fastest-time route can be longer in one direction.

The screenshots identify a whole road, without a house number or premises. The live address API accepts that road's Google Place ID with `streetNumber: null` and `postalCode: null`. This is an address-validation defect. It makes the fixed quote depend on a road's representative point rather than the customer's actual destination.

Both the primary OSRM host and its fallback reproduced the distance asymmetry. Repeating the live quote calculation using the same Google-resolved road point in both directions returned vehicle fares £51 and £62, with zero time surcharge and zero embedded BFS fixed costs. Adding the existing £5 terminal-access fee produces the screenshot totals exactly.

### Calculation trace

The following exact route measurements are a fresh reproduction using the canonical BFS point and the selected Holywood Road Place Details point. Original screenshots do not contain a retained routing-response ID; these are not claimed to be the original historical raw responses.

| Component | BFS pickup → Holywood Road | Holywood Road → BFS drop-off |
|---|---:|---:|
| Trip | 23 October 2026, 21:40 | 30 October 2026, 09:34 |
| OSRM passenger distance | 26,299.5 m / 16.34175 miles | 33,155.6 m / 20.60193 miles |
| OSRM duration | 29.705 minutes | 30.183 minutes |
| Rounded screenshot labels | 16 miles / 30 minutes | 21 miles / 30 minutes |
| Configured Saloon formula | £10 + £2.50 × raw miles | £10 + £2.50 × raw miles |
| Formula result before whole-pound rounding | £50.8544 | £61.5048 |
| Existing formula minimum (£30) | No uplift | No uplift |
| Vehicle fare after existing rounding | £51 | £62 |
| Night/weekend surcharge | £0 | £0 |
| Return discount | £0 — one-way | £0 — one-way |
| Embedded BFS fixed cost | £0 | £0 |
| Separate Express access charge | £5 pickup | £5 drop-off |
| **Payable** | **£56** | **£67** |

Both dates are Fridays. The configured night premium is 25%, starting at 22:00; the weekend premium is 10%. Neither applies. The different passenger/luggage selections remain within Saloon capacity. Postcode pricing is disabled. The proposed £45 minimum leaves both vehicle fares unchanged.

The reproduced pickup route uses the Ballyhill Road–Ligoniel Road–Crumlin Road corridor. The reverse uses the M2/Ballyrobin Road corridor. In the current reproduction, the pickup's longer motorway alternative is about 21.00 miles and 30.78 minutes, versus 16.34 miles and 29.71 minutes for the selected route. The reverse's shorter alternative is about 19.50 miles and 31.58 minutes, versus 20.60 miles and 30.18 minutes selected. This explains similar durations with materially different distances. Turn/access restrictions and the routing graph can make travel asymmetric; confirming that every restriction matches the road on the ground needs a separate route review.

### Airport charges and pins

`shared/airport-fixed-costs.ts` supplies £0 embedded BFS cost. `shared/express-drop-off.ts` supplies the existing £5 Express fee, and `shared/meet-greet.ts` resolves pickup/drop-off access per leg. The fee is added once by the website/payment breakdown and excluded from the return discount. Pickup and drop-off are separate leg decisions, although their current Express amounts are equal. No access-fee settings have been changed.

The BFS catalogue pin is `54.6575, -6.2158`. OSRM snaps it about 398 metres to a routable point near Killead Road. A Google forward-geocode of the full airport address returned `54.6651474, -6.2080704`, a different point. Neither observation proves the correct Express pickup/drop-off road entrance. The actual terminal access points should be verified before changing the catalogue. The implementation preserves the existing canonical airport IDs and coordinates.

### Driver positioning and base

The internal profitability route consistently uses the single `OPERATING_BASE` constant for both **base → pickup** and **drop-off → base**, adding the passenger leg between them. Its documented address is **7 Glen Manor Road, Newtownabbey, BT36 7FU**, with coordinates `54.66598, -5.97026`.

However, the source explicitly describes that coordinate as an approximate road-centreline point, not a verified house-number pin. Consistent use is verified; exact placement at number 7 is not.

More significantly, `applyProfitabilityProtection` returns early with `mileage_formula_selected` when the Saloon mileage formula is enabled. The live configuration enables it. Therefore positioning and return-to-base costs do **not** increase either investigated fare. The new airport minimum preserves this existing policy; it does not reactivate or change the profitability formula.

## Implemented: precise location validation

Before implementation, the client primarily checked that a Place ID/text/coordinates existed. It could retain the old selection when the street text still looked similar, and the Google helper could manufacture a street number from typed text. The quote path could also trust client route metrics, and owner/saved quote paths could fall back to text geocoding.

The changes introduce one structured precision predicate and server-authoritative resolution:

- New non-airport selections require Google Place Details, a Place ID, finite coordinates and qualifying structured types. Numbered street addresses require Google's `street_number` and `route`; individual premises/subpremises and named establishments/buildings are supported without requiring a street number.
- Roads, intersections, localities, administrative areas, postcodes/postcode prefixes and geographic areas fail validation, even if the displayed text contains a number or a business-looking name.
- Existing predefined airports retain their canonical selection path. An individual hotel mentioning BFS is not classified as the airport just because of its text.
- The input clears its selected ID/coordinates on every edit. Late asynchronous responses cannot restore an obsolete selection. Invalid choices show “Please choose a full address, hotel or individual building from the suggestions.”
- Both required locations must validate before the quote action is enabled. The same shared address input and selection checks cover homepage, landing-page, booking and chat entry fields, including mobile; automatic owner quotes and saved-quote creation also validate server-side.
- New quote/payment routing resolves the selected IDs again on the server. Client-supplied coordinates, place types and distances cannot bypass validation. No text-geocode fallback creates a new fixed-price quote.
- Selected IDs and authoritative coordinates are retained in saved/automatic owner quotes and pending paid-booking records. Legacy provider support remains available for trusted historical booking workflows. Existing owner-approved fixed-price links retain their agreed-price payment paths.

## Implemented: configurable Belfast International minimum

**Admin location:** Owner Dashboard → Pricing → Saloon → **Belfast International Airport — Minimum Saloon Fare**.

Configuration key: `bfsMinimumSaloonFareGbp`. Missing legacy settings default to £45 once through the shared default; arithmetic does not scatter a hardcoded £45. The field accepts £0–£1,000 with up to two decimal places. It uses existing save/reload, version-conflict, audit, public-config and cache conventions. Older admin clients omitting the new field preserve the saved value.

The floor applies to canonical BFS at either end, including BFS airport-to-airport journeys. Standard BHD/Dublin journeys without a BFS endpoint and other vehicle pricing policies are unchanged. Estate uses the existing configurable supplement: with the live £7 setting, the minimum vehicle fare is £52. Existing default/saved supplement settings are not overwritten.

### Exact calculation order

1. Validate selected locations and resolve authoritative road metrics.
2. Calculate the normal configured vehicle fare, retaining existing mileage/curve/postcode selection and rounding.
3. For each BFS leg, raise the Saloon vehicle fare to the configured BFS floor if necessary. For Estate, the equivalent result is `max(normal Estate fare, BFS Saloon floor + configured Estate supplement)`. No airport fee enters this comparison. Active profitability recalculation also respects this floor.
4. For a return booking, combine the leg base fares and apply the existing 5% return discount to that base only. The minimum is pre-discount.
5. Apply existing qualifying night/weekend surcharges from each undiscounted leg base; those surcharges retain their existing discount treatment.
6. Add airport fixed costs and separately resolved access fees at their existing full values, once per applicable leg. Retain any existing promotion-specific policy.
7. Apply the existing final-payable rounding and payment parity check. A configured BFS floor/supplement containing pence uses the existing exact-pence checkout mechanism, so rounding cannot reduce that configured floor.

With the default £45 minimum and live £5 Express charges, a minimum Saloon one-way quote is £50. A daytime return is £90 less £4.50, plus £10 access = £95.50 before the site's existing whole-pound final rounding, giving **£96 payable**. This rounding policy is unchanged for the £45 default.

Open-website signed quote receipts now bind the new pricing/validation policy into a versioned signature. Older instantaneous quote receipts must refresh, even if the stored admin pricing version did not change on deployment; changing a token prefix cannot bypass this check. Existing separately approved quotes are not silently repriced.

## Proposed routing fix — approval still required

The observed £11 is a consequence of the existing mileage rule applied to different fastest routes; the street-only acceptance is a software defect. Precise addresses and a £45 minimum improve reliability but do not make equivalent journeys directionally equal.

Recommended next step:

1. Verify the real BFS Express access points and the operating-base pin, then replay both directions for numbered addresses and businesses along Holywood Road.
2. Separate the **customer tariff route** from the navigation route. For equivalent endpoints, use a stable, versioned tariff based on a reviewed reasonable route in both directions, or a reviewed airport zone fare. Keep actual directional road metrics for dispatch.
3. Before approving a common tariff, cost both complete jobs from/to the verified base: positioning, passenger leg, empty return, fuel, wear, time and access. Retain the higher required commercial floor. Do not automatically use the shorter route or an average.
4. As a provisional illustration only, using the higher of the current two unrounded reasonable-route distances would give £62 vehicle + £5 access = £67 in either direction at the current day rate. This is **not** a recommended permanent £67 Holywood Road tariff until the precise destinations, airport pin and operating costs are verified.
5. Review the current mileage-mode bypass of profitability protection as a separate approved pricing-policy change. Log pricing version, endpoint IDs, route-provider result, chosen tariff distance, direction, pre-discount floor and separate fee lines for future disputes.

No routing-policy, airport/base-pin, profitability-policy or production-setting change is included in this implementation.

## Verification

All verification used isolated fixtures/mocks for booking, payment, email and admin writes. No live booking, payment, email or pricing change was made.

| Check | Result |
|---|---|
| New minimum, configuration, structured-place, routing and checkout suite | **270 assertions passed** |
| Relevant existing/new regression scripts | **18 scripts passed** |
| Mock SumUp checkout parity | Both directions × Saloon/Estate × one-way/return passed; invalid places and tampered fares blocked |
| Browser flows | **6 Chromium cases passed**: homepage, airport landing page and admin at desktop 1280 px and mobile 390 px |
| Browser address coverage | Numbered home, unnumbered hotel, street rejection, edit invalidation, stale asynchronous response, quote-to-booking continuation |
| Browser admin coverage | £45 initial default; blank rejected; £47.25 saved and retained after reload |
| Root TypeScript | Passed |
| Next.js production build/static export | Passed: 149 pages |
| Worker TypeScript and Wrangler build | Passed; Wrangler **dry run only** |
| WebKit/Safari | Local browser download unavailable; added Chromium + WebKit review CI, result still to be confirmed |

The 18 scripts cover owner settings/formula recovery, website payment composition, airport fixed/access fees, night/weekend premiums, authoritative fares, Place-ID routing, schedule gating, autocomplete, return offers, automatic owner quotes, saved quotes, booking amendments, SumUp metadata, signed receipts and the new combined suite. Existing lint warnings remain; they did not prevent the build.

## Issues requiring attention before release

- Review the draft changes and CI results; production deployment is deliberately excluded. WebKit must complete in CI or another environment before claiming Safari coverage.
- Deploy matching worker and frontend versions as a coordinated release when approved. The strict server may ask users on an older page to refresh/reselect an address. Older instantaneous signed receipts intentionally require a fresh quote.
- Verify the BFS terminal-access and exact number-7 operating-base coordinates before any pin change. Current pins were preserved.
- The existing mileage-mode bypass of profitability protection remains. The new minimum is not a guarantee that long positioning/empty-return jobs are profitable.
- Historical owner-approved fixed-price quotes retain their existing agreed-price workflows. New automatic quotes enforce precise selections.
- The pre-existing conversational assistant cannot calculate a fixed fare without route metrics; this change validates its address selections but does not redesign that separate quoting flow.

## Files changed

The manifest below lists source changes, synchronized worker copies, automated checks and this review document.

```text
.github/workflows/precise-quote-review.yml
.gitignore
docs/bfs-pricing-validation-review.md
scripts/check-airport-airport-access-fees.ts
scripts/check-bfs-minimum-and-precise-places.ts
scripts/check-night-weekend-surcharge.ts
scripts/check-precise-places-browser.mjs
scripts/check-quote-receipt.ts
scripts/check-quote-schedule-price-gate.ts
scripts/check-return-offer-address-confirm.ts
shared/bfs-minimum-fare.ts
shared/booking-notifications.ts
shared/google-places.ts
shared/open-website-payment-fares.ts
shared/owner-pricing-config.ts
shared/precise-quote-place.ts
shared/quick-quote.ts
shared/return-offer.ts
src/app/quick-quote/QuickQuoteOwnerClient.tsx
src/components/AddressInput.tsx
src/components/OwnerPricingPanel.tsx
src/components/QuoteAssistant.tsx
src/components/QuoteCard.tsx
src/lib/addresses-api.ts
src/lib/google-maps.ts
src/lib/quote-assistant-submit.ts
src/lib/quote-assistant.ts
src/lib/quote-service.ts
src/lib/quote.ts
src/lib/selected-place.ts
workers/addresses/shared/bfs-minimum-fare.ts
workers/addresses/shared/booking-notifications.ts
workers/addresses/shared/google-places.ts
workers/addresses/shared/open-website-payment-fares.ts
workers/addresses/shared/owner-pricing-config.ts
workers/addresses/shared/precise-quote-place.ts
workers/addresses/shared/quick-quote.ts
workers/addresses/shared/return-offer.ts
workers/addresses/src/index.ts
workers/addresses/src/owner-pricing-store.ts
workers/addresses/src/precise-quote-locations.ts
workers/addresses/src/profitability.ts
workers/addresses/src/quick-quote-handlers.ts
workers/addresses/src/quote-handlers.ts
workers/addresses/src/quote-receipt.ts
workers/addresses/src/resolve-route-metrics.ts
workers/addresses/src/return-offer-handlers.ts
workers/addresses/src/saved-quote-handlers.ts
```
