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
