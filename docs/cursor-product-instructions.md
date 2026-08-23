# Cursor product instructions — Owner / Driver Quick Quote

Standing instructions for Cursor agents working on My Airport Taxi NI.
Earlier numbered items (1–17) live in prior chat/product context; continue from here.

## 18. OWNER / DRIVER QUICK QUOTE — MINIBUS

Add Minibus as an option to the Owner/Driver Quick Quote only.

This must NOT add Minibus to the public website, public Live Quote, fleet information or imply publicly that My Airport Taxi NI owns/operates a minibus.

In Owner/Driver Quick Quote, vehicle selection should support:

* Saloon
* Minibus

For Minibus, allow an appropriate higher passenger count rather than the normal public-site maximum of 4.

Make the passenger selector change dynamically according to the selected vehicle.

Keep minibus pricing configurable centrally rather than hard-coding prices throughout the UI.

If there is no existing agreed minibus pricing formula, do not invent one. Add configurable minibus pricing settings and clearly report what values still need to be agreed.

**Current status:** Existing `pricing-config.json` `vehicleMultipliers["Minibus (5–7 passengers)"] = 1.55` (and related A2A floors) is the agreed formula. Quick Quote uses that — no invented QQ-only rates.

Minibus quotes should still support addresses, airports, dates/times, luggage, return journeys and the normal Personal Quote/customer-send workflow.

## 19. OWNER / DRIVER QUICK QUOTE — OPTIONAL DISCOUNT

Add an optional Discount control to Owner/Driver Quick Quote.

First calculate and display the normal fare from the canonical pricing engine.

Example:

Calculated fare: £65

Then allow the Owner/Driver to apply either:

* Percentage discount — e.g. 5%, 10%, 15%
* Fixed discount — e.g. £5, £10
* No discount

Also allow a custom percentage or custom £ amount if practical.

Immediately show:

Original fare: £65
Discount: 10% (-£6.50)
Customer price: £58.50

Never allow a discount to produce a negative fare.

Store separately:

* calculated/original fare
* discount type
* discount amount/value
* final customer fare

This is important so the Owner Dashboard financial records can distinguish the genuine calculated fare from a discretionary discount.

The final discounted price is the amount shown to the customer and, if the quote is converted to a booking, the amount that should be charged.

Do NOT alter the canonical pricing engine itself when a discount is applied. The discount is an Owner/Driver override applied after normal fare calculation.

Do not automatically make discounts available to customers on the public Live Quote.

If a return-booking discount already exists in the pricing engine, show it separately and make sure the manual discount does not accidentally replace or double-apply it.

Add tests for percentage discounts, fixed discounts, zero discount, excessive discounts, return discount interaction, quote-to-booking conversion and stored financial totals.

## 20. PRICING — NO WEEKEND / BANK HOLIDAY SURCHARGE (ALTERNATIVE-TIME SAFE)

**Pricing — IMPORTANT**

Do not apply any weekend or Bank Holiday surcharge.

My Airport Taxi NI pricing is the same on weekdays, weekends and Bank Holidays.

Offering the customer a different pickup time/date must therefore not change the fare merely because the alternative falls on a weekend or Bank Holiday.

Preserve the customer’s existing quoted fare when offering an alternative pickup time unless another genuine journey input has changed that affects the canonical fare calculation.

Also audit the canonical pricing configuration to ensure there is no active weekend or Bank Holiday multiplier/surcharge being applied by:

* Public Live Quote
* Personal Quote
* Driver Quick Quote
* alternative-time booking flow

Do not change any other pricing rules.

Example: Friday 14:00 → Saturday 15:00 must keep the same fare when only the pickup datetime changed.

**Canonical config (current):**

* `pricing-config.json` → `airportTripPremiumRate: 0`
* `pricing-config.json` → `addressToAddressTripPremiumRate: 0`
* `operational.weekendAndBankHoliday.premiumRate: 0`

Regression: `scripts/check-airport-weekend-premium.ts` and `scripts/check-pricing-vehicle-quote-flow.ts`.

## 21. OFFER ALTERNATIVE TIME (SHORT-NOTICE / UNAVAILABLE)

For bookings awaiting availability confirmation, Owner Dashboard shows:

* **Approve requested time**
* **Offer alternative time**
* **Decline — no availability**

Offer alternative time:

* Owner enters alternative date/time (+ optional customer note)
* Preserve original requested date/time for audit (`originalRequestedDate` / `originalRequestedTime`)
* Email customer with secure **Accept new pickup time** link (`/accept-alternative-time/?token=…`)
* Do **not** take payment or create SumUp until the customer accepts
* On accept: update booking to offered time (amount unchanged), approve for payment, auto-send existing payment-link email
* Acceptance is idempotent (repeat clicks do not duplicate booking/payment)

While offered: show Requested / Offered / Status: Awaiting customer acceptance, plus Resend alternative-time email, Change offered time, Withdraw offer, Decline booking.

Regression: `scripts/check-short-notice-alternative-time.ts`.
