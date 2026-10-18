# Grand Central pre-deployment review

Reviewed commit: `431afcd4`; baseline: unchanged parent/main `b729adee`.

No application changes were needed in this review. No deployment, push, merge, real payment, customer email or Ads conversion was performed.

## Changes

- Updated `scripts/check-homepage-mobile-quote-ui.ts` for current airport-waiting line wrapping and current cookie consent copy.
- Updated `scripts/check-luggage-capacity-confirmation.ts` for current 5+ wording, Saloon two-suitcase and Estate four-suitcase suitability boundaries, and both two-small-bag labels. Approved Saloon allowance remains two standard 23kg suitcases plus two small bags; Estate four large suitcases plus two small bags. Weight-free display labels remain unchanged.
- Added `scripts/check-station-wording-scope.ts` to inspect rendered HTML for every exported route.

## Results

- Production static build: PASS (`GITHUB_PAGES=true npm run build`), with existing lint warnings.
- TypeScript: PASS (`node_modules/.bin/tsc --noEmit`).
- Relevant offline regression scripts: 114 executed, 86 passed, 28 failed.
- New rendered scope check: PASS across all 168 exported HTML pages. Total including it: 115 scripts, 87 passed, 28 failed.
- All 28 failures reproduced on unchanged baseline. No new failures; the two requested stale tests now pass.
- Scope check confirms station introduction and pickup notice only occur on the Grand Central page. Homepage, BFS, BHD, Dublin, Belfast→Dublin and Newtownabbey quote introductions retain shared wording. All 11 station FAQs remain.
- Reviewed application diff: optional introduction/notice props only; fare calculation, booking handlers, SumUp integrations, vehicle suitability and availability logic unchanged.
- Passing checks include station classification in both directions, synthetic £7 Estate/5% return pricing invariants, minibus availability, checkout page, worker booking endpoints, SumUp booking conversion/metadata/payment UX, booking validation, restored-payment routes, deposits, short-notice inflight payment and availability.

## Remaining failures

These are baseline failures, not proven regressions from the station commit. Exact text/source assertions are distinguished from behavioral fixture mismatches. They have not all been waived as harmless.

| Script | Cause |
|---|---|
| `check-a2a-personalised-quote.ts` | Expects City Hall–Boucher to require manual approval; current classifier returns false. Existing behavior needs a separate policy review. |
| `check-airport-airport-access-fees.ts` | Historical Antrim→BHD configuration expected £35; current value £29. |
| `check-airport-pickup-destination-area.ts` | Expects obsolete £10 Estate supplement; approved value is £7. |
| `check-airport-pricing-revision.ts` | Expects obsolete £10 Estate supplement; approved value is £7. |
| `check-bfs-bhd-roi-instant-quote.ts` | Historical fare fixture expected £63; current engine returns £60. |
| `check-business-class-quote-selector.ts` | Expects old Estate marketing description; current description states luggage capacity. |
| `check-customer-booking-reference.ts` | Source assertion expects exact text “Booking reference:” in confirmation client; literal is absent. Does not independently establish a missing reference at runtime. |
| `check-dublin-airport-fare-adjustment.ts` | Expects obsolete £10 Estate supplement; approved value is £7. |
| `check-homepage-hero-ctas.ts` | Expects old responsive CSS order classes in hero markup. |
| `check-minimum-booking-notice.ts` | Expects old inline WhatsApp help wording in QuoteCard. |
| `check-mobile-quote-step-scroll.ts` | Expects old direct glide target expression; current scroll implementation differs. Device behavior not validated here. |
| `check-mobile-quote-top-spacing.ts` | Expects old responsive CSS order classes in hero markup. |
| `check-pricing-benchmarks.ts` | Historical City Hall→BFS Estate fixture expects £54; current fare £51, consistent with £3 lower supplement. |
| `check-quick-quote-knocknagoney-e2e.ts` | Source assertion requires an old routing comment about browser OSRM metrics. |
| `check-quick-quote-minibus-discount.ts` | Source assertion prohibits vehicleChoice, which exists in current selector implementation. |
| `check-quick-quote-roi-manual-price.ts` | Historical fare fixture expects £273; current engine returns £259. |
| `check-quote-daylight-contrast.ts` | Source assertion prohibits text-white/45, /50 or /55; current QuoteCard contains such classes. Actual contrast needs browser review. |
| `check-quote-funnel-analytics.ts` | Expects purchaseSendTo empty; current configuration supplies a purchase conversion destination. |
| `check-quote-party-selection.ts` | Source assertion expects old schedule-gating expression; current homepage supports price before date/time. |
| `check-quote-step-highlight.ts` | Source assertion expects old “Step 3 — Complete your booking” literal. |
| `check-quote-tool-ux.ts` | Source assertion expects removed “Standard suitcases (23kg)” display label. |
| `check-quote-vehicle-fare-refresh.ts` | Expects obsolete £10 Estate supplement; approved value is £7. |
| `check-return-offer.ts` | Expects obsolete £10 Estate supplement and £2.50 saving on £50; approved supplement £7. |
| `check-express-drop-off.ts` | Source assertion expects old airportAccess render expression. |
| `check-short-notice-payment-email.ts` | Source assertion prohibits SumUp/checkout references in resend handler; current handler includes them. Existing payment-email behavior merits separate review. |
| `check-return-offer-journey-ux.ts` | Source assertion expects old returnOfferToken-only one-way initializer; current initializer also covers homepage. |
| `check-business-class-minimum.ts` | Expects obsolete £10 Estate supplement; approved value is £7. |
| `check-uk-time.ts` | Expects premium for Monday 06:00; current configured premium rule returns false. Existing premium-policy fixture mismatch. |

## Limits

Offline regression tests ran with external fetch blocked; tests supplied their own mock dependencies. No live payment was attempted. Browser/device interaction, rendered mobile contrast and production external-service behavior remain unverified. The suite is not fully green; baseline policy/fixture failures should be triaged separately before claiming full release certification.

## Reproduction and complete script inventory

Run each listed TypeScript/TSX script with `node --import tsx scripts/<filename>`. Run the scope check after the static build. Browser harnesses requiring a server, production credentials, live integrations, preview generation, unrelated owner/refund workflows and daily operational checks were outside this offline suite.

| Script | Result |
|---|---|
| `check-a2a-personalised-quote.ts` | FAIL (same on baseline) |
| `check-airport-airport-access-fees.ts` | FAIL (same on baseline) |
| `check-airport-fee-product-rules.ts` | PASS |
| `check-airport-fee-wording.ts` | PASS |
| `check-airport-fixed-costs.ts` | PASS |
| `check-airport-hero-images.ts` | PASS |
| `check-airport-pickup-destination-area.ts` | FAIL (same on baseline) |
| `check-airport-pickup-flight-required.ts` | PASS |
| `check-airport-pickup-reminder.ts` | PASS |
| `check-airport-pricing-revision.ts` | FAIL (same on baseline) |
| `check-airport-to-airport-pricing.ts` | PASS |
| `check-airport-weekend-premium.ts` | PASS |
| `check-belfast-airport-distance-floor.ts` | PASS |
| `check-belfast-airport-island-lookup.ts` | PASS |
| `check-bfs-bhd-roi-instant-quote.ts` | FAIL (same on baseline) |
| `check-book-quote-mobile.ts` | PASS |
| `check-booking-request-validation.ts` | PASS |
| `check-business-class-dublin-page.ts` | PASS |
| `check-business-class-minimum.ts` | FAIL (same on baseline) |
| `check-business-class-quote-mode.ts` | PASS |
| `check-business-class-quote-selector.ts` | FAIL (same on baseline) |
| `check-cancellation-refund-wording.ts` | PASS |
| `check-child-seats-booking-sumup.ts` | PASS |
| `check-customer-booking-reference.ts` | FAIL (same on baseline) |
| `check-customer-smart-availability.ts` | PASS |
| `check-deferred-quote-flights.ts` | PASS |
| `check-deposit-cash.ts` | PASS |
| `check-desktop-homepage-layout.ts` | PASS |
| `check-dublin-airport-fare-adjustment.ts` | FAIL (same on baseline) |
| `check-dublin-airport-label.ts` | PASS |
| `check-express-drop-off.ts` | FAIL (same on baseline) |
| `check-express-fare-display.ts` | PASS |
| `check-fresh-visit-address-reset.ts` | PASS |
| `check-global-pricing-routes.ts` | PASS |
| `check-google-ads-request-quote.ts` | PASS |
| `check-grand-central-station.ts` | PASS |
| `check-homepage-hero-copy.ts` | PASS |
| `check-homepage-hero-ctas.ts` | FAIL (same on baseline) |
| `check-homepage-mobile-quote-ui.ts` | PASS |
| `check-homepage-premium-cards.ts` | PASS |
| `check-landing-hero-media.ts` | PASS |
| `check-landing-quote-cta.ts` | PASS |
| `check-luggage-capacity-confirmation.ts` | PASS |
| `check-minibus-availability.ts` | PASS |
| `check-minibus-personal-quote.ts` | PASS |
| `check-minimum-booking-notice.ts` | FAIL (same on baseline) |
| `check-mobile-menu-scroll.ts` | PASS |
| `check-mobile-quote-autoscroll.ts` | PASS |
| `check-mobile-quote-step-scroll.ts` | FAIL (same on baseline) |
| `check-mobile-quote-top-spacing.ts` | FAIL (same on baseline) |
| `check-paid-booking-ads-conversion.ts` | PASS |
| `check-paid-booking-resend.ts` | PASS |
| `check-payment-placeid-route-resolve.ts` | PASS |
| `check-personal-quote-codes.ts` | PASS |
| `check-postcode-pricing.ts` | PASS |
| `check-pricing-benchmarks.ts` | FAIL (same on baseline) |
| `check-pricing-confirmation.ts` | PASS |
| `check-pricing-vehicle-quote-flow.ts` | PASS |
| `check-public-minibus-capacity.ts` | PASS |
| `check-quick-quote-checkout-expiry-hotfix.ts` | PASS |
| `check-quick-quote-knocknagoney-e2e.ts` | FAIL (same on baseline) |
| `check-quick-quote-minibus-discount.ts` | FAIL (same on baseline) |
| `check-quick-quote-roi-manual-price.ts` | FAIL (same on baseline) |
| `check-quick-quote.ts` | PASS |
| `check-quote-airport-benefits.tsx` | PASS |
| `check-quote-authoritative-fare.ts` | PASS |
| `check-quote-checkout-page.ts` | PASS |
| `check-quote-datetime-overflow.ts` | PASS |
| `check-quote-daylight-contrast.ts` | FAIL (same on baseline) |
| `check-quote-error-help-render.tsx` | PASS |
| `check-quote-error-help-start-new.ts` | PASS |
| `check-quote-flight-booking-stage.ts` | PASS |
| `check-quote-funnel-analytics.ts` | FAIL (same on baseline) |
| `check-quote-journey-direction.ts` | PASS |
| `check-quote-mode-config.ts` | PASS |
| `check-quote-party-selection.ts` | FAIL (same on baseline) |
| `check-quote-path-fare-parity.ts` | PASS |
| `check-quote-pax-luggage.ts` | PASS |
| `check-quote-positioning-performance.ts` | PASS |
| `check-quote-receipt.ts` | PASS |
| `check-quote-required-fields.ts` | PASS |
| `check-quote-reveal-scroll.ts` | PASS |
| `check-quote-reveal-stability.ts` | PASS |
| `check-quote-routing-recovery.ts` | PASS |
| `check-quote-schedule-price-gate.ts` | PASS |
| `check-quote-selected-state.ts` | PASS |
| `check-quote-step-highlight.ts` | FAIL (same on baseline) |
| `check-quote-tool-ux.ts` | FAIL (same on baseline) |
| `check-quote-vehicle-fare-refresh.ts` | FAIL (same on baseline) |
| `check-restored-places-route-payment.ts` | PASS |
| `check-return-offer-address-confirm.ts` | PASS |
| `check-return-offer-address-confirm.ts` | PASS |
| `check-return-offer-journey-ux.ts` | FAIL (same on baseline) |
| `check-return-offer.ts` | FAIL (same on baseline) |
| `check-saved-quote-booking-suppression.ts` | PASS |
| `check-saved-quote.ts` | PASS |
| `check-served-airport-suggestions.ts` | PASS |
| `check-short-notice-alternative-time.ts` | PASS |
| `check-short-notice-inflight-payment.ts` | PASS |
| `check-short-notice-lead-expiry.ts` | PASS |
| `check-short-notice-minibus-booking.ts` | PASS |
| `check-short-notice-payment-email.ts` | FAIL (same on baseline) |
| `check-short-notice-period-setting.ts` | PASS |
| `check-start-new-quote.ts` | PASS |
| `check-sumup-booking-conversion.ts` | PASS |
| `check-sumup-payment-ux.ts` | PASS |
| `check-sumup-transaction-metadata.ts` | PASS |
| `check-technical-seo.ts` | PASS |
| `check-test-booking-isolation.ts` | PASS |
| `check-test-booking-isolation.ts` | PASS |
| `check-town-landing-pages.ts` | PASS |
| `check-uk-time.ts` | FAIL (same on baseline) |
| `check-universal-distance-pricing.ts` | PASS |
| `check-worker-booking-endpoints.ts` | PASS |
| `check-station-wording-scope.ts` | PASS |
