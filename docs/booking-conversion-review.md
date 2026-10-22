# Quote-to-booking conversion review

This branch starts at main `e7ec891f6579d4cb0ff662f19f3a532b4f31e93f`. Pricing PR #680 was open, draft and unmerged at inspection, head `7a8a9f062fc96b082a591b57b3f41200247a3565`. It has not been changed by this conversion task. This is a separate review-only branch: do not merge, deploy or change live settings automatically.

## Changes

- Replace the three result-card benefits with compact refund reassurance and, when the existing deposit offer is eligible, a small-deposit reassurance immediately above the fare. Existing airport services and charge calculations remain.
- Extract the existing selectable payment cards into a presentation-only component. Show calculated deposit, cash balance and full payment amounts, with selected-state accessibility.
- Remove the duplicated cash panel and summary. Keep one warning and a required, initially unchecked cash acknowledgement with a minimum 44px label target. Changing to full payment clears/hides it. The deposit button is disabled until acknowledged; the existing handler and server acknowledgement checks remain.
- Use dynamic “Pay … & Confirm Booking” labels. Do not change SumUp Hosted Checkout, payment requests, verification, booking persistence or confirmation decisions.
- Align checkout, Terms, Cancellation Policy, FAQs, confirmed-booking page and shared confirmation-email wording with **at least 24 hours / 100% of the amount paid**. The compact quote uses the approved “100% Refund — Cancel 24+ Hours Before Pickup” wording.

## Deposit configuration and arithmetic — unchanged

`shared/deposit-cash.ts` defaults to 20%, minimum £15, disabled until enabled by the owner. The read-only production quote response retained from the 22 October investigation reports `enabled: true`, `percent: 20`, `minimumGbp: 15`. The public quote response is the source used by the UI; no admin login or settings write was performed. A separate attempted GET of `/booking-notice` was denied (403); the configuration evidence comes from `/quote/calculate`, not that endpoint.

The existing owner control is **Deposit + Cash** in the booking availability / short-notice dashboard panel (`OwnerDepositCashSettings`, embedded by `OwnerShortNoticePanel`). It supports enabling, deposit percentage and minimum deposit.

| Total | Deposit | Cash balance | Deposit option |
|---:|---:|---:|---|
| £68.00 | £15.00 | £53.00 | Available |
| £100.00 | £20.00 | £80.00 | Available |
| £190.40 | £38.40 | £152.00 | Available |
| £15.00 | £15.00 | £0.00 | Hidden; full online payment |
| £10.00 | £10.00 | £0.00 | Hidden; full online payment |

Existing detail to retain: after percentage/minimum/cap, fractional cash pennies move into the deposit so the cash balance is a whole-pound amount. Thus £190.40 has a £38.40 deposit rather than exactly £38.08. Deposit + Cash is unavailable when the deposit reaches 95% of the fare or there is no qualifying cash balance. No rounding, eligibility, tariff, supplement, minimum, discount, airport charge or configuration changes are made here. £10 and £15 are synthetic calculator safety cases, not new customer tariffs.

## Refund verification

`isWithin24HoursOfPickup` uses `< 24`, so exactly 24 hours is eligible under the existing boundary. Tests cover one second before, exactly at and one second inside that boundary. Refund operations use gross money actually collected and cap refunds at collected money less prior refunds; they do not refund an unpaid cash balance. A qualifying £68 full payment can refund £68; a qualifying £15 deposit can refund £15. No processing fee deduction was found in that calculation.

Refunds remain owner-operated through existing SumUp refund tools. This does not introduce automatic cancellation/refund processing. Failed processor requests must not be described as completed refunds; the existing refund safety checks are retained. The earlier “more than 24 hours” wording conflicted with the implementation at the exact boundary; this PR corrects the wording only. Amendment notice rules are separate and untouched.

## Analytics audit and recommendation

No tracking code or third-party service is added in this PR.

| Requested stage | Existing evidence | Minimal next step |
|---|---|---|
| Quote generated | Consent-gated `quote_generated` / Ads quote conversion | Retain and verify reporting in the existing account |
| Book This Transfer clicked | No dedicated funnel event found | Add `quote_book_clicked` to existing consent-gated funnel helper |
| Booking form started | Fraud telemetry `booking_started` occurs at submission/payment attempt, not first form interaction | Add `booking_form_started` once on first interaction |
| Payment option selected | No dedicated funnel event found | Add `payment_option_selected` with only the payment-method enum |
| Payment initiated | Fraud telemetry records `booking_started` at pay attempt | Add `payment_initiated` only after checkout creation succeeds |
| Booking completed | Verified return flow fires paid conversion / `payment_completed`; `submit-booking` also uses `booking_completed` for a submitted request | Reuse the verified success event for confirmed-booking reporting; do not count submitted requests as paid bookings |

Use the existing GA4/dataLayer consent gate, deduplication and a strict parameter whitelist. No names, email addresses, phone numbers, addresses, Google Place IDs, free text or customer booking references in these proposed funnel events. Existing optional consented enhanced-conversion handling was inspected but not modified.

An existing analytics regression test expects the Ads quote destination to be blank, while main already has a configured destination. Both that test and the advertising configuration are unchanged by this PR. This pre-existing failure is reported rather than changing the account configuration.

## Verification

- Frontend TypeScript, lint within production build and 149-page static export pass; existing repository warnings remain.
- Worker typecheck and Wrangler **dry-run** pass. No deployment occurred.
- Deposit, conversion presentation, cancellation wording, refund safety, one-leg refund, airport access, quote benefits/order, quote checkout, pricing/vehicle, payment Place ID route resolution, SumUp conversion and paid-booking Ads tests pass.
- Payment browser tests intercept every external request. They check dynamic £68/£15/£53 values, £100/£20/£80, below-minimum safety, disabled deposits, option switching, unchecked acknowledgement, server-bound payment payloads, pending versus verified confirmation, policy text and no horizontal overflow.
- Real SumUp payments/refunds and production writes were not used for testing. Linux WebKit approximates mobile Safari; physical iPhone testing remains a release check.
- The refund safety test had a stale expected privacy date; its assertion now matches the existing main date of 20 October 2026. Privacy content and policy versions were not changed.

The browser measurements and representative previews are alongside this report. CI status must be checked on the final PR head before release.

The pre-merge CI review also exposed a checked-in email preview with the old cancellation text. `public/invoice-example.html` was regenerated from the unchanged email builder to match the shared policy. The preview and cancellation wording checks pass.

The vehicle stability test reproduced a Chromium nearest-edge scrolling artefact at 320px: the button's bottom was 900.34375px in a 900px viewport, although its centre was unobstructed and the vehicle heading/scroll position did not move during repricing. Unchanged main passed because its previous card height produced a different fractional position. The test now centres the button after sampling, just as it already centres vehicle choices before sampling. The full-visibility, hit-target, overflow and 2px stability assertions remain unchanged; application scrolling and pricing code are untouched.

## Pricing PR dependency

The only changed path shared with #680 is `src/components/QuoteCard.tsx`. This PR touches its imports and render-only payment/results sections. Its tariff calculations, routing, Places selection, payment handlers and confirmation handling are unchanged. The £45 BFS minimum and corrected routing pin being reviewed in #680 are not copied into this branch. Keep release sequencing and their combined regression checks explicit.

| Width | Chromium height before → after | WebKit height before → after |
|---:|---:|---:|
| 320px | 529.34 → 516.59px | 524 → 510px |
| 360px | 495.28 → 464.66px | 491 → 460px |
| 375px | 495.28 → 464.66px | 491 → 443px |
| 390px | 495.28 → 446.78px | 491 → 443px |
| 1280px | 614.16 → 612.06px | 611.19 → 608.19px |

All ten measured cards are shorter than unchanged main. Both browsers pass the conversion flow at all five widths and the additional eligibility cases.

[320px quote preview](booking-conversion/320-quote.png) · [390px payment preview](booking-conversion/390-payment.png)

A read-only `git merge-tree --write-tree` simulation with #680 head `7a8a9f0` completed without conflicts. No branch was merged or updated by that check. Combined runtime tests should still be repeated at the chosen release order.

## Files changed

- `.github/workflows/booking-conversion-review.yml`
- `docs/booking-conversion-review.md`
- `docs/booking-conversion/320-quote.png`
- `docs/booking-conversion/390-payment.png`
- `docs/booking-conversion/chromium-measurements.json`
- `docs/booking-conversion/webkit-measurements.json`
- `public/invoice-example.html`
- `scripts/check-booking-conversion-browser.mjs`
- `scripts/check-booking-conversion.tsx`
- `scripts/check-booking-confirmation-preview.ts`
- `scripts/check-cancellation-refund-wording.ts`
- `scripts/check-deposit-cash.ts`
- `scripts/check-express-drop-off.ts`
- `scripts/check-quote-airport-benefits.tsx`
- `scripts/check-quote-checkout-page.ts`
- `scripts/check-refund-ops.ts`
- `scripts/check-return-vehicle-stability.mjs`
- `shared/cancellation-policy.ts`
- `src/app/booking-confirmed/BookingConfirmedClient.tsx`
- `src/components/BookingPaymentOptions.tsx`
- `src/components/BookingTermsConsent.tsx`
- `src/components/QuoteCard.tsx`
- `src/components/QuoteFareTrust.tsx`
- `src/components/QuoteReassurance.tsx`
- `src/components/QuoteResultShowcase.tsx`
- `src/lib/terms.ts`
- `workers/addresses/shared/cancellation-policy.ts`

Additional regression sweep: personal quote codes, unpaid booking requests, luggage confirmation and Smart Availability checks pass with the new payment-button wording. Their assertions, plus the legacy mobile-scroll test’s button assertion, were updated to match the approved label. The mobile-scroll test still fails on an unrelated, pre-existing expectation for `scheduleBookTransferGlide(step3CustomerDetailsRef...)`; main uses the schedule-aware target. Navigation implementation is unchanged, and the real browser quote-to-booking tests pass.

Additional test files changed:

- `scripts/check-personal-quote-codes.ts`
- `scripts/check-mobile-quote-step-scroll.ts`
- `scripts/check-booking-request-validation.ts`
- `scripts/check-luggage-capacity-confirmation.ts`
- `scripts/check-customer-smart-availability.ts`
