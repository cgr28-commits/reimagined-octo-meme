# Airport access choice change — implementation specification (PR #680)

Status: scoped only; NOT implemented or tested. Do not merge/deploy on this document alone.

## Approved customer experience
- Homepage instant quote displays the genuine vehicle fare without optional airport access or Meet & Greet fees. Keep mobile quote compact.
- After **Book This Transfer**, show **Airport pickup & drop-off preferences**, with a genuinely available **Free – Long Stay car park** selected by default for each eligible leg. Belfast International walk approx. 5 minutes; Belfast City approx. 5–10 minutes. Validate direction-specific availability and wording.
- Optional **Terminal Collection / Terminal Drop-off**: BFS £5, BHD £4; do not use the customer-facing term Express. Only offer applicable services at the correct airport and journey direction.
- Airport arrivals: optional **Meet & Greet**, driver inside Arrivals with personalised name board; single dashboard-configurable inclusive price covering parking, never double-charge access/parking. Preserve existing configured price.
- Show the selected service, added charge and final payable total before checkout; preserve selection through signed quote, payment, stored booking and customer/owner/driver emails, including return legs.
- Preserve mileage tariff, £45 BFS Saloon vehicle-fare floor, Estate supplement, 5% return discount on journey fares only, existing scheduling pricing and other airport rules. Do not alter paid bookings or production settings.

## Verified code concern
- On branch fix/precise-quote-locations, src/components/QuoteCard.tsx initializes outboundAccessChoice and returnAccessChoice to 'express', and draft restoration explicitly sets both to 'express'. Its websiteAirportAccessLeadLabel describes access as included and no free alternative. Changing just the visible labels would NOT implement the approved experience.
- Audit shared/express-drop-off, shared airport access quote logic, QuoteCard, quote receipt, Worker quote/payment handlers, and stored/email representations together before implementation.

## Acceptance tests
- BFS/BHD, both directions, one-way and return, Saloon/Estate, free/terminal/M&G: quote fare unaffected by optional fees, optional fees exactly once, total correct and updates immediately.
- Free is selected on fresh booking and when restoring a previously selected free option; user-selected paid/M&G choice persists on restore.
- M&G is one inclusive fee with no duplicate terminal/parking fee; no M&G for drop-offs.
- Frontend, Worker, signed receipt, checkout, paid confirmation and notification parity; mobile layout unchanged; no live payment calls.
