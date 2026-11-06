# Pricing test questions (documented only, live pricing unchanged)

Two existing automated checks disagree with live pricing behaviour. **Live pricing has NOT been changed**, and the checks have not been edited. Each needs an owner decision first. Until then the two checks keep failing, as they did before this work (they are not run in CI or deployment).

## Q1. Should airport access sit inside the Business Class minimum fare?

- **Check:** `npm run check:business-class-minimum` (`scripts/check-business-class-minimum.ts`).
- **Today (live):** for a short one-way Business Class journey whose fare is below the minimum, the minimum is applied first and the airport access charge is added on top. Example from the test fixture: fare £60 + £5 access becomes **£80** (£75 minimum + £5 access). `shared/website-fare-breakdown.ts` passes `outboundAirportAccessChargeGbp: 0` to the minimum calculation, with the comment that optional services keep their exact price.
- **The test expects:** **£75** total, with access counted inside the minimum. This matches the docstring in `shared/business-class-minimum.ts` ("airport access inside it is not added again").
- **The same check also** still expects the old £10 Estate supplement. The approved figure is **£7**, which is live and must not change. That part of the test is simply out of date.
- **Decision needed:** keep £80 (access on top: update the test and the docstring), or £75 (access inside: a live pricing change, which would need its own approval).

## Q2. Should the 7 Seater Minibus inherit the Belfast International minimum fare?

- **Check:** `npm run check:owner-pricing`. The failing part is the chained `scripts/check-public-minibus-capacity.ts`, line ~421.
- **Today (live):** `applyBfsMinimumFare` (`shared/bfs-minimum-fare.ts`) raises only Saloon and Estate fares to the BFS minimum. For the 22 km City Hall → BFS fixture, the raw Saloon fare £44 is raised to £45, but the Minibus is calculated from the un-raised £44: (£44 + £7) × 1.55 = **£79.05**.
- **The test expects:** **£80.60**, the Minibus derived from the raised £45.
- **Decision needed:** keep £79.05 (Minibus not raised: change the test fixture to a journey above the minimum), or £80.60 (Minibus follows the raised Saloon: a live pricing change needing its own approval).

## Unchanged by this work

The airport instant quote calculator, Business Class automatic pricing, the configurable £7 Estate supplement, BFS minimum fares, Dublin Airport pricing, the 5% return discount, airport access charges, and vehicle availability and capacity rules.
