# Optional booking-stage Meet & Greet

## Behaviour

The standard website booking form offers an unchecked Meet & Greet checkbox immediately after contact details for supported BFS, BHD and DUB pickups. The existing navy/emerald styling and compact checkbox target are retained. The option is absent from airport drop-offs and ordinary journeys. Business Class's already-included service is not charged again. Existing fixed-price payment links retain their agreed services; they do not offer this new extra and the server rejects attempts to add it through those links.

The price comes from the existing `meetGreet.bfsGbp`, `bhdGbp`, and `dubGbp` dashboard settings. No setting or price is duplicated. Entering contact details reloads the configured service prices. Selection immediately updates the booking summary, full-payment total, and deposit/cash split. The existing vehicle quote, BFS minimum, Estate uplift, return discount, airport access fees and complimentary waiting benefit are unchanged.

The payment server resolves airport eligibility, calculates the existing transfer fare, adds the configured service fee afterwards without a return discount, and checks the accepted final total before creating the SumUp checkout. Client fee snapshots are discarded. The pending and paid records retain the agreed service charge, so later admin edits cannot reprice a checkout. Customer and owner emails, driver job details and driver assignment emails include the service. Confirmation and repeat confirmation expose the server-stored charge. The FAQ and quote-help answer no longer incorrectly say the optional service is unavailable.

## Validation

- 384 isolated payment cases: BFS/BHD/DUB, pickup/drop-off, selected/unselected, Saloon/Estate, one-way/return, signed/unsigned quotes, £15/£18.25 configured price sets, full payment and deposit/cash. 288 valid checkouts and 96 rejected ineligible selections. Actual Worker, payment adapter, finalization, storage and email composers run against mocked routing, SumUp and email providers.
- Verified separate access fees, unchanged discount calculation, altered accepted amounts rejected, injected client fee ignored, admin changes after checkout do not reprice, repeat finalization is idempotent, driver job details and assignment email service instructions.
- Admin validation/public configuration checks include £0, £17.25 and £100. Ordinary and unsupported pickup eligibility rejected.
- Chromium at 320, 390 and 1280px: unchecked default, collection-only display, placement below email, selected/unselected totals and no horizontal overflow. 390px also submits the payment payload and verifies the server-returned charge on confirmation. Matching Chromium/WebKit CI runs are included in the new workflow. Physical iPhone testing remains outstanding; local WebKit lacks its required system libraries.
- Frontend typecheck, lint (existing warnings), production static export and Worker typecheck/dry-run build passed.
- Sixteen regression suites passed: booking-meet-greet-payment, meet-greet, meet-greet-email-upgrade, bfs-minimum-only, bfs-minimum-payment, deposit-cash, express-drop-off, customer-confirm-email, owner-email-bcc, driver-whatsapp-voice, add-driver, quote-checkout-page, pricing-vehicle-quote-flow, open-website-payment-fares, pricing-confirmation, quote-authoritative-fare.
- An additional `check-driver-on-the-way.ts` check fails identically on unchanged main `08cdfdf`: it expects WhatsApp wording but the existing email contains TRACK YOUR DRIVER copy. This pre-existing mismatch is outside this change; no assertion was weakened or existing workflow changed.
- All checkout, email and routing calls in the tests are mocked. No real bookings, customer notifications or payments were made.

## Data and rollout

No database migration, live pricing edit, new secret or backfill is required. Existing KV booking records gain optional `meetGreetFeeGbp`; existing access-choice fields store the selection. Old records retain existing formatting and behaviour. Deploy the Worker and frontend together only after approval (Worker first avoids temporarily offering an option an older backend cannot price). No production deployment has been performed. The repository may build its usual PR preview automatically.

PR #683 remains separate. This branch is based on main after #682 and does not include the pending #683 wording changes.

## Modified files
- `.github/workflows/booking-meet-greet-review.yml`
- `docs/booking-meet-greet-review.md`
- `scripts/check-booking-meet-greet-browser.mjs`
- `scripts/check-booking-meet-greet-payment.ts`
- `shared/booking-job.ts`
- `shared/booking-notifications.ts`
- `shared/express-drop-off.ts`
- `shared/meet-greet.ts`
- `shared/paid-booking-canonical.ts`
- `shared/paid-booking-record.ts`
- `shared/website-promo-pricing.ts`
- `src/app/booking-confirmed/BookingConfirmedClient.tsx`
- `src/components/QuoteCard.tsx`
- `src/lib/booking-message.ts`
- `src/lib/create-payment.ts`
- `src/lib/data.ts`
- `src/lib/quote-assistant.ts`
- `workers/addresses/shared/booking-job.ts`
- `workers/addresses/shared/booking-notifications.ts`
- `workers/addresses/shared/express-drop-off.ts`
- `workers/addresses/shared/meet-greet.ts`
- `workers/addresses/shared/paid-booking-canonical.ts`
- `workers/addresses/shared/paid-booking-record.ts`
- `workers/addresses/shared/website-promo-pricing.ts`
- `workers/addresses/src/booking-job-handlers.ts`
- `workers/addresses/src/driver-assignment-handlers.ts`
- `workers/addresses/src/finalize-paid-checkout.ts`
- `workers/addresses/src/index.ts`
- `workers/addresses/src/paid-booking-handlers.ts`
- `workers/addresses/src/refund-handlers.ts`
