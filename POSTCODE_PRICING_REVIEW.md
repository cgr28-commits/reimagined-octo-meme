# Postcode Pricing — review and deployment plan

## Status

Implemented and tested locally on `codex/postcode-pricing`, based on merged main commit `b194781d`. No push, deployment, production KV write or rule activation has been performed. The existing production fares remain unchanged.

Approved amounts for both BT1 and BT2 are staged for review:

| Destination | Saloon total | Estate total with current £10 supplement |
| --- | ---: | ---: |
| Dublin Airport | £245 | £255 |
| Belfast International | £55 | £65 |
| Belfast City | £35 | £45 |

All six staged rules have Enabled selected in the **unsaved draft**, not in production. Estate always uses the configurable supplement, not a hardcoded Estate fare. Default settings contain no postcode rules. Loading the approved rules does not save or activate them. No further fare decision is pending; deployment/activation approval is still required.

## Existing architecture reused

- Next.js static-export site; existing `/owner/` dashboard uses `DriverPageClient` with owner-only tools.
- Owner settings are in Cloudflare `TRACKING_STORE` KV under `owner:pricing-settings`, with version checks and `owner:pricing-audit`. No SQL database or migration is needed.
- Existing `/owner/pricing` authenticated GET/POST API, owner credentials, preview isolation, validation and audit patterns are reused.
- `postcodeRules` is an optional backwards-compatible settings field. Missing fields from older client saves preserve current rules. Restoring ordinary pricing defaults also preserves separately managed postcode rules.
- Existing public pricing configuration delivers the rules to the browser; the Worker reads stored rules independently and ignores client-supplied prices/rules.

## Behaviour

- Owner → More → **Postcode Pricing** supports add/edit, airport selection, enabled/disabled status, deletion, searchable table, draft review and explicit Save confirmation.
- Rules use complete NI outward districts (BT1, BT2, BT10, etc.), extracted from the existing full-postcode parser. Spaced/unspaced and lowercase postcodes work; a district-only/ambiguous address without a full postcode does not receive a postcode fare.
- Matching is exact, directional, and limited to Saloon/Estate. Airport-to-airport and other vehicle pricing remain unchanged.
- Fixed rules override mileage, Dublin adjustment, time surcharges and profitability floors for the matching leg. Administrators should therefore assess profitability before enabling a fixed fare.
- Estate always reads the current configured Estate supplement; no product code hardcodes £6 or £10.
- Included airport costs are split out of the fixed total and added back once through the unchanged existing composition. Dublin is £241 journey + existing £4 toll = £245; International is £50 journey + existing £5 terminal charge = £55; City is £31 journey + existing £4 terminal charge = £35. The base quote API excludes separately composed terminal access, as before. The website button, booking summary and SumUp charge show the full approved totals. Airport fees are neither waived nor added twice.
- Return journeys price each direction separately: only the district-to-airport leg receives the postcode price. The reverse leg keeps ordinary pricing, including any existing profitability/time rules. The existing 5% journey-fare discount is applied once; airport costs retain their existing undiscounted treatment.
- The existing 10-second Worker quote-settings cache can briefly retain a previous settings snapshot after a save, as with other dashboard pricing changes.

## Verification results

Passed:

- `node --import tsx scripts/check-postcode-pricing.ts`: full BT1 and BT2 addresses; lowercase/compact postcodes; £245/£255; alternative Estate supplements; BT10/BT11/BT12/BT21 non-matches; other airports and vehicles; disabled rules; reverse one-way fares; mixed return fares; fixed-price priority over time/profitability calculations; included fees and exact checkout amounts.
- Actual Worker `/quote/calculate` matrix across BT1, BT2, BT10, BT12, Dublin/Belfast International/Belfast City, both directions, Saloon/Estate. Stored settings win over forged client prices/rules.
- Test-only alternative Belfast fixtures verify configurable district fares; the approved £55/£65 International and £35/£45 City totals are also tested for both full BT1/BT2 addresses.
- Owner API persistence/readback, audit entries, editing/deletion/disabling, malformed/duplicate rule rejection, stale-save 409, unauthenticated/wrong-key/driver-session 401, preview-write 403, and old-client rule preservation.
- Active profitability protection retains the configured fixed price while preserving normal protected pricing on unmatched return legs.
- Actual `/payments` requotes for BT1 and BT2 reach a mocked SumUp Hosted Checkout at exactly £245/£255 Dublin, £55/£65 International and £35/£45 City. Pending booking amounts are persisted correctly; tampered accepted totals are rejected before checkout. Routing, payment and notification providers were mocked; no live payments/messages were sent.
- `scripts/check-postcode-pricing-browser.cjs`: 390px and 1280px dashboard → authenticated API → in-memory KV/audit → customer quote/booking. Add/edit/disable/delete/search, draft-not-yet-saved state, duplicate rejection, stale-edit handling, reload persistence, all six approved Saloon/Estate quote buttons and existing booking details work. No JavaScript exceptions or page overflow. The table scrolls horizontally on narrow screens.
- Existing owner-pricing, PR435 fare consistency, profitability-floor, vehicle/pricing quote flow, booking-request validation, Business Class capacity, deferred quote flights, quote receipts, open-website payment fares and quote-path parity checks.
- Frontend static production build, project lint (existing warnings only), Worker build/dry-run, and git whitespace checks. The final clean build excludes the temporary browser test route.

Browser/API/KV/payment tests are isolated. No production dashboard credentials or customer records were used. Temporary browser fixtures are not part of the shipped application.

## Deployment steps — require approval first

1. Obtain approval to deploy/activate the approved fares.
2. After approval, publish/review the branch and deploy the Worker and frontend using existing workflows. Deploying code alone installs no active postcode rules.
3. In the authorised dashboard, open More → Postcode Pricing. Load the approved BT1/BT2 airport rules, review all six rows, the live Estate supplement and Enabled values, then explicitly Save postcode pricing.
4. After the settings-cache interval, verify fresh BT1/BT2 Saloon/Estate quotes and non-matching/reverse journeys. No test payment is required to activate the feature.
5. To stop a rule, disable or delete it and save; fresh unmatched journeys resume the ordinary calculator.

## Effects on existing bookings

Paid/confirmed bookings and previously approved fixed/manual quote amounts are not edited by the feature. No booking, refund, confirmation or notification records are migrated. Existing checkout receipts and price-mismatch checks remain in place. An unpaid website quote or saved journey that is recalculated after a pricing change may require a refreshed fare and customer acceptance, using the existing workflow; it must not silently charge a different total.

## Files changed

- `shared/postcode-pricing.ts` and `workers/addresses/shared/postcode-pricing.ts`
- `shared/owner-pricing-config.ts` and `workers/addresses/shared/owner-pricing-config.ts`
- `src/components/OwnerPostcodePricingPanel.tsx`
- `src/components/OwnerDashboardToolSwitcher.tsx`
- `src/app/driver/DriverPageClient.tsx`
- `src/lib/quote.ts`
- `workers/addresses/src/owner-pricing-store.ts`
- `workers/addresses/src/quote-handlers.ts`
- `workers/addresses/src/profitability.ts`
- `workers/addresses/src/index.ts`
- `scripts/check-postcode-pricing.ts`
- `scripts/check-postcode-pricing-browser.cjs`
- `POSTCODE_PRICING_REVIEW.md`
