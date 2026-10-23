# Standalone Belfast International minimum fare

Base: main `0499b79cbf161e7aa1aa1a1f67a7c5fe9b324a52`. Extracted from draft PR #680 without modifying that PR. Review date: 23 October 2026.

## Scope

Adds the existing `bfsMinimumSaloonFareGbp` setting, default £45, under Owner Dashboard → Pricing → Saloon. The existing settings store, validation, audit and public-config response are reused. Valid values are £0–£1,000 with up to two decimals. Older admin clients that omit it retain the saved value.

The normal configured Saloon vehicle fare is calculated first, then raised to the BFS minimum when either endpoint is Belfast International. Estate adds the configured supplement to the minimum-adjusted Saloon fare. Existing per-leg time premiums, the 5% return discount, separate airport fees and final rounding retain their established order. A binding fractional minimum preserves pence through display and payment. Higher fares and non-BFS journeys retain their existing calculations.

Main's airport identity matching, airport/operating-base coordinates, road-routing code, address suggestions, house-number requirements and public quote layout are unchanged. The profitability-policy removal, stricter address validation, new location record fields and other changes from PR #680 are excluded. The mileage formula's existing treatment of profitability remains unchanged.

The shared engine is used by the quote API and payment recalculation. The new signed receipt namespace `v2-bfs-minimum` prevents pre-minimum receipts bypassing the floor and is forwarded by both browser adapters. Payment still verifies the signed receipt or independently recalculates the fare server-side. Existing confirmation, record and email handlers consume that agreed amount; their templates and schema are unchanged.

## Validation

- **246 focused checks passed:** both directions, fare boundaries, configured Estate uplift, return discounts, airport fees, BFS airport-to-airport routes, unchanged BHD/DUB/LDY/ordinary fares, aliases, admin save/reload, validation and legacy admin preservation.
- **192 integration cases passed:** low/high fares, two minimum/supplement settings, BFS/BHD/DUB, both directions, Saloon/Estate, one-way/return, signed and unsigned checkout. Exercises the actual browser quote/payment adapters, Worker payment handler, mocked SumUp verification, paid confirmation, stored record and customer HTML/text and owner email. Tampered totals are rejected before checkout creation; later admin edits do not reprice agreed fares; repeated confirmation does not send duplicate emails.
- **21 pricing/payment regression suites passed.** BFS assertions were updated from the previous £44 vehicle fare to the £45 floor, including derived premiums and return totals. Other assertions remain in place.
- Frontend and Worker TypeScript, Worker dry-run bundle, frontend static export (149 pages) and lint passed. Lint reports existing warnings.
- React review: the admin control is labelled, uses a decimal keyboard and preserves intermediate decimal input. Quote memo dependencies include the new precision flags. No public markup or extra network request was added.
- An additional exploratory `check-quote-party-selection.ts` check fails on an old source-text assertion about adjacent quote-gating expressions. The identical failure was reproduced on untouched main. This unrelated test and the quote-gating logic are unchanged; it is not a pricing failure.

All payment, email, routing and storage integration calls are mocked/in-memory. No real booking, payment or message was created. Physical iPhone testing was not performed. GitHub CI must be checked on the published PR head before release.

## Files

- Calculation/configuration: `shared/bfs-minimum-fare.ts`, `shared/owner-pricing-config.ts`, `src/lib/quote.ts`, `src/lib/quote-service.ts`, and the two corresponding Worker shared files.
- Administration: `src/components/OwnerPricingPanel.tsx`, `workers/addresses/src/owner-pricing-store.ts`.
- Display/payment propagation: `src/components/QuoteCard.tsx`, `src/lib/quote-display-fare.ts`, `src/lib/quick-quote-api.ts`, `src/lib/create-payment.ts`, `workers/addresses/src/quote-handlers.ts`, `workers/addresses/src/quote-receipt.ts`, `workers/addresses/src/index.ts`.
- Tests: two new BFS-only scripts and seven existing receipt/fare/premium regression scripts; `.github/workflows/bfs-minimum-review.yml`; this report.

## Release

No database migration or manual live setting change is required. Missing stored values default to £45; existing saved custom values are preserved. Existing paid bookings are not repriced. Release matching frontend and Worker versions together after approval; existing instant quotes may need refreshing because of the new receipt format.

This is a draft only. No merge, deployment or live settings change is authorised. If this PR is merged, reconcile PR #680 with main before its later review so the shared minimum implementation is not reapplied as a second feature.
