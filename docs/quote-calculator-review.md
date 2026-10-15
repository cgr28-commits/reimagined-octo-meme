# Quote calculator review — 15 October 2026

Implemented on `codex/quote-calculator-review`. No production deployment, live pricing writes, bookings, payment transactions, or customer notifications were performed.

## Root cause

The public configuration read during this review was version 179, updated 14 October 2026 at 17:34:39 UTC. Both `executive.requestQuote` and `minibus.requestQuote` were `true`.

Fresh Vercel/local customer previews previously used the isolated pricing-demo defaults, which set both modes to instant pricing. Selecting Business Class therefore asked the production quote service for an instant fare despite the actual manual-quote setting. The Worker intentionally returns HTTP 409 with `reason: personal_quote_required` for those vehicles. The client classified that policy response as a generic unavailable price.

The endpoint's refusal is confirmed by the existing Worker handler and reproduced with a controlled API response in browser tests. Direct live calculation requests from this environment could not be completed; no claim is made that live checkout was exercised.

## Changes

- Ordinary customer previews now read the existing public pricing endpoint. Saved preview overrides, explicit minibus demo queries, and owner pricing-demo pages still use isolated settings. Owner writes remain isolated.
- Quote requests wait until public settings have loaded. Manual vehicles are excluded from background fare requests.
- An explicit `personal_quote_required` response switches that vehicle to the existing personal-quote workflow rather than an API-error card.
- Manual cards retain the selected vehicle and party details, show the requested personalised-quote message and REQUEST A QUOTE action, and omit fixed-price claims, airport charge inclusions and payment controls.
- Instant cards never retain another vehicle's price during switching. Responses with a different vehicle type cannot populate the selected vehicle's fare/cache.
- Airport pickup/drop-off headings are consistent, including Dublin. Dublin's designated pickup wording and zero-charge drop-off wording follow the existing airport configuration. Airport-to-airport sections remain within one panel.
- Airport panel padding, section gaps, heading size and the gap before the booking button are smaller. Descriptions retain readable 12px text. Buttons remain full-width with a measured minimum height of 48px.

## Files

- `src/components/QuoteCard.tsx` — modes, request sequencing, policy response, manual card and vehicle-fare validation.
- `src/components/QuoteResultShowcase.tsx` — manual presentation and compact airport spacing.
- `src/components/QuoteAirportBenefits.tsx` — consistent, accurate airport copy and compact layout.
- `src/lib/owner-pricing-api.ts` — public config for ordinary customer previews.
- `src/lib/pricing-preview-store.ts` — explicit demo/override detection.
- `scripts/check-quote-airport-benefits.tsx` — airport direction and rendered manual-card assertions.
- `scripts/check-quote-mode-config.ts` — public modes versus isolated demos; read-only access.
- `scripts/check-quote-calculator-browser.cjs` — reproducible browser matrix with controlled API responses and a temporary development-only harness, removed after execution.
- `docs/quote-calculator-review.md` — this handover.

## Verification

Browser tests passed for 256 combinations: 375, 390, 430 and 1280px widths × eight journeys × one-way/return × four vehicle selections. Journeys covered address ↔ BFS, address ↔ BHD, address ↔ DUB, and BFS ↔ DUB. Checks covered correct direction headings, section counts, single panels, manual/instant states, fare/button agreement, no card overflow, tap target size, and no JavaScript exceptions.

Additional browser checks passed for Business Class and minibus with instant pricing enabled in the test configuration, a stale configuration followed by the server's manual-quote response, and the REQUEST A QUOTE transition into the existing customer-details form. These used intercepted API responses; no external booking/payment submission was made.

Passing automated checks:

- `node --import tsx scripts/check-quote-mode-config.ts`
- `node --import tsx scripts/check-quote-airport-benefits.tsx`
- `node --import tsx scripts/check-quote-path-fare-parity.ts`
- `node --import tsx scripts/check-owner-pricing.ts`
- `node --import tsx scripts/check-airport-fixed-costs.ts`
- `node --import tsx scripts/check-homepage-mobile-quote-ui.ts`
- TypeScript check and targeted ESLint (zero errors; 24 existing QuoteCard warnings).
- `GITHUB_PAGES=true npm run build` — passed, including all 147 static pages.

The existing `check-quote-vehicle-fare-refresh.ts` monetary checks pass, but its source-text assertion expects an obsolete `getAutoVehicle(pax, suitcases` spelling. That assertion also fails in the unchanged baseline. It was not changed to conceal the failure.

## Business decision

The brief describes an Estate uplift of £6. The current public configuration reports £10, and the current local engine regression examples also use £10. No rate or pricing configuration was changed. Confirm the intended uplift separately before any live pricing adjustment.

Both Business Class and minibus remain manual-quote vehicles under the currently saved public settings. Instant pricing is supported when the owner explicitly configures it; no new formula was introduced.
