# PR #692 release consolidation — NOT approved for production

## Audited inputs (24 October 2026)

- main: `2c6bfb59a9fad54389990f217ee3b0cc056af93b`.
- #682 merged as `08cdfdf55d2d95337fad3fb499bf9fde477526d1`, already in main. Its configurable £45 BFS Saloon minimum is retained.
- #680: `f4137d2521ff1115a3d7626291d16982e31133a6`, unmerged; not used as integration base.
- #691: `9d21c99c0c79a664f6b8e0a6b167be5880303ca0`, approved homepage presentation.
- #692: `5dd0284f22beaa070482e4bce2544a6e3aa585b6`, backed up remotely at `backup/pr692-before-main-integration-20261024` before restructuring.
- Temporary integration branch: `integration/pr692-main-release`, based directly on main. Existing PR and review history retained; no new PR.

## Inclusion/exclusion checklist

Included:
- Approved homepage headline/supporting copy, mobile eyebrow hiding, Manrope quote heading, six slate navy inputs, emerald Lucide icons, compact sizing and no swap button.
- Optional per-visit Belfast access (free default, configurable BFS £5/BHD £4), inclusive Meet & Greet, independent return visits, customer/driver/admin stored breakdowns.
- Approved compact booking, flight validation, seats, dates, summary controls, cash acknowledgement, payment choices, cookie persistence/safe area/scroll clearance.
- Main's saved-quote restoration and owner booking-alert fixes, evening pricing configuration, optional Dublin Meet & Greet and existing Dublin access rules.
- Server access recalculation, signed receipt binding, persisted validated place IDs, exact service pence and idempotent paid checkout confirmation.
- Saved quotes now preserve free/paid/per-visit choices instead of coercing free access to paid.

Excluded from #680:
- Strict building/premise-only address requirements and related Google types contracts.
- Airport pin/location changes, operating-base changes and unrelated routing rewrites.
- The preview-only address adapter and its build hooks. Preview uses normal production API code.
- Positioning-mileage/profitability uplift to customer fares. Existing admin operating-cost analysis remains; the customer pricing boundary returns the existing tariff unchanged.

Required selectively reviewed dependencies:
- Only the narrow customer-fare boundary from #680 is retained: operational estimates cannot replace customer tariffs. No #680 routing code is retained.
- A route-distance fixture from #680 supports isolated tests only; it does not change production coordinates or routes.
- Receipt format is `v4-optional-terminal-access` to distinguish optional-access fare semantics. Main's signing/verification implementation remains; stale receipts require a refreshed quote.
- Worker shared copies are regenerated from root shared modules, including two previously stale display copies already present in main.

## Validation recorded locally

- TypeScript, ESLint (existing warnings), static frontend production build, Worker typecheck/dry-run build: passed.
- 1,152 vehicle-fare snapshots match untouched main across airports/directions/vehicles, single/return, formula modes, supplements and date bands. Dublin fixed costs also match.
- 246 configurable BFS minimum checks; 72 access combinations; 864 isolated signed quote/payment/storage/customer-owner confirmation cases: passed.
- Saved quotes, deposit/cash, Meet & Greet, flight validation, signed receipt tampering/expiry, checkout structure, required fields and schedule gates: passed.
- Profitability regression expectations intentionally changed to assert unchanged customer fares and zero positioning requests, while retaining analytical calculations.
- Initial frontend build interruption came from installing test dependencies during build; clean `npm ci` and a fresh build passed.
- Local Playwright browser archives could not be downloaded. Chromium/WebKit 375/390 verification must pass in GitHub Actions; not claimed from local checks.
- Payment and email tests use isolated mocks. No real charges, emails or customer records were created.

## Production compatibility and blockers

NOT RELEASE-READY until these are resolved and recorded against the final commit:
1. Required GitHub checks and Chromium/WebKit runs must pass; final exact Vercel deployment must be READY.
2. Read-only production binding preflight must succeed. Secret presence alone cannot establish credential validity or delivery.
3. The currently deployed Worker has not been updated. A frontend-only Vercel preview cannot demonstrate optional-access production checkout compatibility. No test-only API adapter conceals this limitation.
4. Mixed frontend/backend versions need a verified cutover strategy: old v2 receipts and cached old frontends cannot be assumed compatible with v4 optional-access semantics. Existing pending/paid checkouts retain their stored totals; newly created checkouts must use matched code. A matching non-production Worker plus sandbox/provider verification is required before release approval.
5. Existing Pages and Worker workflows both auto-deploy independently on pushes to main. External Cloudflare/Vercel Git integrations also require an inventory. Do not merge while this can cause an uncoordinated rollout.

## Data/configuration

No new database/KV namespace or Durable Object migration. New access choices/visits and place IDs are additive JSON fields. Existing bookings are not migrated or repriced. Missing terminal-access configuration defaults to £5/£4; old admin saves preserve current values. No live settings have been changed. Confirm actual production pricing, binding IDs, signing secret, notification and SumUp configuration read-only before release.

## Deployment and rollback plan (requires explicit owner approval)

1. Complete matching staging frontend/Worker verification and resolve mixed-version behavior; record exact source SHA, deployed Worker version and frontend artifact. Capture current deployment IDs/configuration without exposing secrets.
2. After approval, control all automatic deploy integrations so a merge cannot race deployment; build both artifacts from the same approved main commit. This control change itself has not been performed.
3. Deploy compatible Worker first, verify read-only health/quote contracts, then release the matching frontend. If old-client compatibility is not established, do not proceed with this order; schedule an explicitly approved controlled cutover instead.
4. Verify real website addresses, fares, free/paid/M&G choices, signed totals and both payment modes without charging a card. Monitor existing checkout verification, confirmation failures and duplicate events.
5. On regression, stop new checkout creation using an approved operational procedure and roll back both artifacts to the recorded pair. Do not delete bookings, payments or new JSON fields; preserve pending checkout records and reconciliation. A frontend-only rollback is insufficient while Worker fare semantics differ.
6. Keep #680 and obsolete drafts open until successful release verification, then ask before closing.

No merge, production deployment, live pricing update or real payment is authorized by this report. Request final release approval only after blockers are closed.
