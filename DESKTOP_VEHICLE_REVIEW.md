# Desktop vehicle selection review

Changes are on local branch `codex/premium-desktop-vehicles`, based on the merged mobile styling. No branch push, merge, Vercel deployment or production deployment was performed.

## Changes

- Desktop at 1024px and above: four equal-width, equal-height vehicle cards in the existing order: Saloon, Estate or similar larger vehicle, Business Class, 7 Seater Minibus. Selected summary stays underneath.
- Reused the approved mobile navy/emerald colours, subtle gradients and existing transparent vehicle images. No images were edited or replaced.
- Mobile and tablet styling/layout retained. Business Class capacity wording is the authorised exception: 1–3 passengers on both desktop and mobile.
- Business Class capacity is enforced in vehicle selection, manual quote submission, owner quote amendments/approval, unpaid booking validation and payment, including reuse of an existing approved-quote checkout. Legacy stored vehicle identifiers remain unchanged.
- Corrected existing Business Class capacity claims in supporting customer content and owner guidance. No fare formulas, vehicle pricing settings, airport fees, discounts, luggage limits or payment integration were changed.
- Hid the inline “Need help? WhatsApp us” line beneath the quote tool at desktop widths only. Mobile and other WhatsApp contact controls remain unchanged.
- Added the existing shared airport-label helper to the Worker mirror so a clean Worker typecheck can resolve its existing import. Its content is unchanged from the root shared module.

## Verification

Passed:

- Browser checks at 320, 375, 390, 430, 768, 1023, 1024, 1280, 1440 and 1920px: all four selections, fixed-price/manual states, correct card order, aligned desktop geometry, image loading, transparent desktop/mobile sources, no horizontal overflow or clipped visible text, and no JavaScript exceptions.
- Desktop screenshots at 1440px, for Saloon and 7 Seater Minibus. The displayed £65 is a mocked test fare.
- Existing browser booking regression: Business Class and 7 Seater quote requests at Belfast International, Belfast City and Dublin airports, one-way and return, on mobile and desktop. Initial requests omit flight numbers; approved airport bookings collect them before payment. Approved return/airport-to-airport and checkout payload checks passed.
- New Business Class capacity regression: three accepted, four rejected; other vehicle capacities preserved; unsuitable selection fallback; request, approval and existing-checkout protection.
- Existing vehicle selection, vehicle suitability/Estate uplift, pricing/quote flow (including 5% return discount), booking request validation, selected-state and Dublin Business Class content checks.
- Frontend static production build, project lint, Worker build/dry-run and final Worker typecheck. Lint reports existing warnings; no errors.
- Git whitespace/diff checks.

All external API, notification and payment calls in browser/backend flow tests were mocked. No customer requests or payments were sent.

## Review note

Existing unpaid Business Class quotes for four passengers must be amended before approval/payment. Existing paid booking records were not changed. No further business decision is required for the requested changes.

## Files modified or added

- `scripts/check-business-class-dublin-page.ts`
- `scripts/check-business-class-passenger-limit.ts`
- `scripts/check-premium-desktop-vehicles.cjs`
- `shared/business-class-capacity.ts`
- `shared/paid-booking-gate.ts`
- `shared/passenger-limits.ts`
- `shared/vehicle-display.ts`
- `src/app/globals.css`
- `src/app/transfers/[slug]/page.tsx`
- `src/app/transfers/business-class-dublin-airport/page.tsx`
- `src/components/OwnerPricingPanel.tsx`
- `src/components/QuoteHelpContact.tsx`
- `src/components/QuoteResultShowcase.tsx`
- `src/components/QuoteVehicleCategories.tsx`
- `src/components/VehiclesSection.tsx`
- `src/components/vehicle-quote-art.tsx`
- `src/lib/business-class-dublin-content.ts`
- `src/lib/data.ts`
- `src/lib/quote-assistant.ts`
- `src/lib/terms.ts`
- `src/lib/transfer-routes-belfast.ts`
- `src/lib/transfer-routes-content.ts`
- `src/lib/vehicle-selection.ts`
- `workers/addresses/shared/airport-display-label.ts`
- `workers/addresses/shared/business-class-capacity.ts`
- `workers/addresses/shared/paid-booking-gate.ts`
- `workers/addresses/shared/passenger-limits.ts`
- `workers/addresses/shared/vehicle-display.ts`
- `workers/addresses/src/a2a-quote-handlers.ts`
- `workers/addresses/src/index.ts`
