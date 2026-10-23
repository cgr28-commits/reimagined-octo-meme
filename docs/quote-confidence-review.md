# Quote reassurance review

Updates the existing reassurance slot immediately above the fare with the requested Book with Confidence heading, refund sentence, fixed-fare/security line, conditional complimentary waiting line, cancellation line and terms note. Uses existing navy/emerald styling and compact 13px text. No extra refund text beneath the booking button.

Airport collections are identified from existing journey state, including an airport collection on the return leg. One-way airport drop-offs and non-airport journeys omit the waiting line. Manual/unavailable quotes retain their existing presentation.

## Modified files

- `src/components/QuoteReassurance.tsx`: requested text and conditional waiting line.
- `src/components/QuoteResultShowcase.tsx`: pass the collection flag through the visible and existing hidden layout reference slots.
- `src/components/QuoteCard.tsx`: one presentation prop derived from existing journey state.
- `scripts/check-booking-conversion.tsx`, `scripts/check-quote-airport-benefits.tsx`, `scripts/check-express-drop-off.ts`: update old copy assertions and check no duplicate refund text beneath the button.
- `scripts/check-booking-conversion-browser.mjs`: requested copy, conditional collection/return wording, overflow and preserved fare/button/vehicle dimensions and styles.

## Validation

- Frontend TypeScript, lint (existing warnings), static export build: passed, 149 pages.
- Nine relevant suites passed: booking conversion, deposit/cash, cancellation wording, airport benefits, Express Drop-Off, refund operations, SumUp conversion, vehicle pricing flow and quote checkout.
- Chromium: 320, 360, 375, 390 and 1280px; booking navigation, deposit/full payment selection, acknowledgement, mocked payment payloads and verified confirmation passed.
- Airport collection wording: 320, 390 and 1280px; return-leg collection: 390px passed. One-way drop-offs omit waiting wording.
- Comparison against the existing quote presentation: fare, booking button and vehicle summary dimensions/colours/font sizes unchanged at all five widths. New text adds about 63px to the drop-off card; the existing elements naturally flow below it. No existing element was resized or repositioned by CSS. No horizontal overflow.
- Visually reviewed the narrow airport-collection screenshot. Headless Chromium lacks the shield emoji font; devices render the requested native emoji with their system font.
- WebKit could not run locally because the installed Playwright version lacks its matching browser executable. The existing PR workflow runs Chromium and WebKit with matching browsers. Physical iPhone testing remains unverified.

Pricing, discounts, airport charges, payment implementation and backend are unchanged. All browser external requests were intercepted; no live bookings or payments were created. No database migration or live settings change is required. Separate draft UI PR; pricing PRs #680 and #682 are untouched. No merge or deployment performed.
