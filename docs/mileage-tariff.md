# Mileage tariff

New automatic quotes use max(£30, £10 + £2.20 × passenger road miles).
The route service supplies the road distance. Positioning, empty return mileage,
postcodes and hourly earnings targets do not set the new customer fare.

Configured Estate uplift, Minibus/Executive multipliers, vehicle availability,
Business Class minimum and return discount are preserved. Saved ordinary night
and weekend settings remain in force; this change does not enable new ordinary
premiums or add a bank-holiday calendar. The former Dublin percentage adjustment
is retired so Dublin uses the same mileage formula.

A 50% festive journey premium applies in Europe/London wall-clock time:
- 24 December 14:00 inclusive to 27 December 06:00 exclusive.
- 31 December 20:00 inclusive to 2 January 00:00 exclusive.

Use the higher of the festive and existing configured ordinary premium, never
stack them. Apply premiums to the vehicle journey fare only. Preserve the existing
return-discount calculation: discount the combined base journey fare, not premiums
or fixed fees. Apply each leg's pickup date independently.

Airport access, parking and toll allowances retain their existing values and are
added after the mileage minimum and premiums. Final payable rounding remains at
the existing checkout boundary, nearest pound. Do not round the base journey to
whole pounds before applying the premium.

Customer quote and checkout components and customer fare text/HTML show the time
adjustment inside the journey fare, without surcharge or time-period labels.
Owner settings explain the rules. Email delivery/timing is unchanged.

Stored bookings and owner-approved fixed amounts are not migrated or rewritten.
Existing saved postcode rules remain stored but cannot enable postcode pricing.
The old hourly floor is disabled even when a saved MPG exists. Signed quote
receipts use a new version namespace so unbooked old-tariff receipts must refresh.
Server routing and receipt verification remain enabled independently of that floor.

## Verification

Passed locally:
- New tariff examples, saved-setting override prevention and configurable uplift.
- Festive boundaries, ordinary rates, no stacking, mixed-date return and access fees.
- Public/Quick Quote/Personal Quote calculation parity on 10 route/vehicle cases.
- Open website payment fare checks including client amount/distance/airport tampering.
- Airport fixed-cost checks and signed quote receipt checks.
- Server-rendered quote/checkout and customer HTML/text fare wording.
- Frontend and Worker TypeScript checks.
- Static production export (local API URLs) and Worker dry-run bundle.

Use `node --import tsx scripts/<check>.ts` where the tsx CLI cannot open its IPC
socket. The customer render check is `npm run check:customer-fixed-fare-display`.

## Release

This branch is a draft, not a production deployment. Deploy the frontend and
Worker together after review. Frontend-only previews still connected to the old
production Worker are not valid demonstrations of the new authoritative prices.
Historical curve/postcode/hourly tests now verify the replacement mileage tariff,
retained archived records, stale-price rejection and independent saved night/weekend
controls. Required checks must pass before merging. Isolated checkout tests mock
all external calls; no real payment or customer email is sent. Rollback is the prior code revision;
no production KV settings have been written by this implementation.
