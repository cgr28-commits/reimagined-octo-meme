# Postcode Pricing management extension

## Release status

Built on merged PR #640 (`6fd40051`) in branch `codex/postcode-pricing-management`.
This extension has **not been pushed, merged, deployed or activated**. No production KV, existing fare settings, bookings, payments, customer messages or confirmations were changed.

Release compatibility correction: **preserve the six already-active v205 outbound fares without a settings migration**. An explicit switch value always wins. If the switch is missing, existing enabled legacy/approved rules preserve ON behaviour; configurations without active approved rules remain OFF. Reading settings never writes a switch or changes the version. Production settings are not changed by this fix.

**GO for the compatibility release**, subject to normal reviewed-commit CI and separate release approval. Both deployment orders were tested against the actual historical implementation, with no temporary fare change in the isolated v205 fixture. This is not approval to deploy or activate additional fares. One supplementary legacy Express UI source assertion fails identically on the unchanged base branch; it is not part of the postcode release workflow and must not be reported as a passing check.

## What changed

- Extended the existing Owner → More → Postcode Pricing tool, rather than replacing the dashboard or quote engine.
- Independent district→airport and airport→district rules. A legacy rule without direction retains its original outbound meaning.
- Approval status: Draft, Needs mileage verification, Approved by owner. Only approved rows may be enabled. Missing approval is compatible only for an enabled legacy rule with no direction metadata; a new directional record cannot inherit legacy approval. Inactive legacy rows without approval require review before re-enabling.
- Exact full outward district matching, including compact/lowercase postcodes. Missing, ambiguous, invalid inward codes and unallocated districts fall back to ordinary pricing. Existing autocomplete addresses remain the source; no district is guessed from town names. Private previews use the provider's structured postal code where available.
- Lists the workbook's 80 geographic districts plus non-geographic BT58, which has no workbook fare. Existing LDY rules remain supported, alongside BHD/BFS/DUB, rather than deleting a previously supported airport.
- Search, airport/direction/approval/activation filters and 25-row pagination. All configured records remain available through the table and CSV export.
- Strict CSV schema, quoted fields and CRLF support; invalid/duplicate rows reject the import. Every imported row becomes inactive and needs verification, regardless of its exported approval/enabled values. Imports/loaders only add missing keys; they never overwrite existing prices.
- Last-changed timestamps are assigned by the Worker, not trusted from imports or clients. Unchanged rows retain their timestamp. Legacy rows without a recorded timestamp are labelled accordingly.
- Owner-only read-only profitability preview, using the existing address input, airport catalogue, OSRM routing, operating base and fuel/wear settings. Routes home→pickup→destination→home. Shows working mileage, driving time, fuel, wear, included airport costs, fare, net contribution and effective hourly contribution. Below £40/hour produces a warning, never a higher customer fare.
- Preview is one-way, with standard terminal access, and explicitly excludes waiting/time uncertainty and optional services. It is a representative-address check, not district-wide verification. Routing/MPG failures show unavailable estimates, not guessed mileage.
- Public pricing configuration excludes disabled/draft rows, private timestamps and all profitability details. Preview endpoint requires existing owner authentication. No customer-facing profitability fields were added.
- Existing preview-session saves and default restores preserve postcode rules and the feature switch. Worker saves/default restores preserve legacy rules and use existing version conflict checks and audit history.
- Updated editors advertise `postcodeRulesEditorVersion: 2`. The new Worker rejects older editors' attempts to change/drop the postcode collection, without changing settings; older ordinary-pricing saves that omit postcode data preserve it. A new frontend connected to the old Worker shows the effective legacy ON state but locks postcode editing until the Worker advertises support. This prevents an OFF save being falsely acknowledged by an old backend that does not support the switch.
- Added PR CI coverage for postcode pricing, owner security, isolated browser flow, frontend lint/build and Worker dry-run build. No deployment step was added.
- An additional reverse-checkout test found two existing whole-pound rounding steps (fare composition and final SumUp amount selection). A trusted, server-derived exception now preserves pence **only when a matched configured postcode fare, including its selected Estate supplement, explicitly contains pence**. It is used consistently by customer display and checkout. Ordinary fares and the agreed whole-pound BT1/BT2 fares retain existing final rounding, including return totals; the browser cannot force this exception with a payment payload.

## Workbook handling and approved prices

Source: `My_Airport_Taxi_NI_BT_Postcode_Fare_Draft.xlsx`, tabs READ ME, Draft fares and Approved only. All 80 draft Saloon rows were transcribed; estimated mileages and workbook Estate columns are **not** pricing inputs.

The workbook proposes symmetric to/from prices. The user's explicit direction restriction takes precedence: only these six outbound prices are marked approved, and all records are loaded **inactive**:

This describes the optional draft-loader behaviour only. The six already-enabled live v205 rules are preserved as enabled; they must not be reloaded or replaced during release.

| Pickup district | Destination | Saloon | Estate with current £10 supplement |
| --- | --- | ---: | ---: |
| BT1 / BT2 | Belfast City | £35 | £45 |
| BT1 / BT2 | Belfast International | £55 | £65 |
| BT1 / BT2 | Dublin | £245 | £255 |

The Estate column is illustrative. Customer prices always use the current dashboard supplement, in pence; no £6 or £10 rule was added.

- **Load approved BT1 / BT2 airport rules** stages 12 records: six approved outbound rates and six inactive, unverified reverse proposals.
- **Load inactive workbook drafts** stages up to 480 records (80 districts × three airports × two directions). Only the six approved outbound records have Approved status. Every newly staged record is inactive; the global switch is unchanged.
- Bulk loading does not call paid routing/geocoding services or pretend workbook mileage was verified. An administrator chooses a real address from existing suggestions to run an on-demand road-route preview. No district-wide real-driving-distance verification was completed in this task.
- Draft data does not reach customer quote calculations or public pricing configuration.

CSV columns, in order: `district,airportCode,direction,saloonFareGbp,approvalStatus,enabled,updatedAt`. Direction is `to-airport` or `from-airport`. Exports contain all configured/draft rows, not merely the filtered page. Reimporting an export does not retain approval/activation or overwrite current rows.

## Fare and booking protection

The original postcode feature's fee composition is retained: included fixed/access charges are split out of the total and added once by the existing booking composition. Dublin arrivals include the existing pickup/parking and toll costs for that direction; departure pricing does not inherit arrival charges. Belfast terminal fees continue through the existing separately composed access path.

The existing journey-only return discount applies once to each separately priced direction's eligible journey amount. Included airport costs keep their existing undiscounted treatment. Fixed fares are not raised by the profitability floor; inactive/unmatched directions use the existing calculator. Business Class and Minibus behavior are untouched.

Paid/confirmed bookings and approved manual quote amounts are not migrated or edited. Existing receipt, requote and accepted-total mismatch checks remain. A later owner-authorised settings change can require an unpaid quote to refresh and obtain customer acceptance, as before. Existing 10-second quote-configuration caching/propagation remains unchanged.

## Architecture / migrations

No SQL database or data migration is required. Reuses Cloudflare KV `owner:pricing-settings` and `owner:pricing-audit`, existing `/owner/pricing` authentication/validation/version checks, and public pricing configuration. Adds optional `postcodePricingEnabled` and optional per-rule `direction`, `approvalStatus`, `updatedAt`. Missing fields on older client saves do not erase stored switch/rules. Compatibility is a shared read-time policy, not a production-data patch.

`POST /owner/postcode-preview` is owner-authenticated, read-only, and uses current server Estate/operating-cost settings. It cannot create bookings, persist rules, mark verification complete, apply a floor or call SumUp. Home coordinates remain Worker-side.

## Verification

- `scripts/check-postcode-pricing.ts`: full BT1/BT2 and compact postcodes, BT10/BT11/BT12 nonmatches, all airports, configurable Estate supplement, inactive/reverse/unaffected fallback, 5% returns, floor priority, owner auth/audit/stale conflicts and exact mocked SumUp amounts £245/£255, £55/£65, £35/£45 for both districts.
- Additional real `/payments` tests for independently configured reverse test fares: exact £123.45/£133.45 checkout/persisted amounts across DUB/BFS/BHD, with pickup/parking/access costs included once. These are isolated test amounts, not approved or staged customer fares.
- `scripts/check-postcode-management.ts`: explicit OFF fallback, missing-switch active legacy preservation, invalid/ambiguous postcodes, catalogue, 480 inactive drafts, outbound-only approvals, safe CSV roundtrip/errors, no overwrite, independently approved reverse rates and both-direction return calculations, pence precision, timestamp forgery rejection, legacy/default preservation, public-data filtering, authorised three-leg home routing and below-target warnings without repricing or storage writes.
- `scripts/check-postcode-release-compatibility.ts` and `scripts/postcode-legacy-harness.cjs`: archive the actual pre-upgrade production-base commit `6fd40051` into an isolated temporary fixture. Compare old frontend pricing/new Worker and new frontend pricing/old Worker for both BT1/BT2, all three airports and Saloon/Estate. Both actual Workers calculate identical customer fares and create identical mocked/persisted checkout amounts. Both directions and returns match the historical engine. Read-only price requests do not migrate or write settings. Explicit OFF/ON, inactive/draft/unverified rows, only six outbound active records, and old-editor destructive-save rejection are covered.
- `scripts/check-postcode-pricing-browser.cjs`: 390px and 1280px. Actual dashboard→authenticated Worker→in-memory KV/audit→public quote→booking form. Explicit switch activation in isolated test data only; add/edit/delete/disable, stale save, preview price, autocomplete→private routing preview, filters, pagination, CSV download/import and no automatic activation. Correct customer buttons for all three approved airports/Saloon/Estate. No page overflow or JavaScript exceptions.
- Explicit pence browser fixture checks £245.45 Saloon / £255.45 Estate, alongside ordinary whole-pound regression checks. No new business fare is inferred from these fixtures.
- Existing owner-pricing, profitability-floor, PR435 price-consistency, vehicle/quote-flow (12 checks), booking-request validation, open-website-payment fares and quote-path parity regressions passed.
- Business Class passenger-limit, deferred-quote flight details, quote receipt, airport fixed costs, night/weekend surcharge and pricing-confirmation regressions passed.
- Supplemental `check-express-drop-off.ts` fails at its existing `on-light` JSX source assertion (line 596). The test file is unchanged from `origin/main`; both `origin/main` and the original extension's `HEAD` lack the expected literal. This is a pre-existing stale UI assertion, not a new postcode failure. No unrelated UI/test rewrite was made. The relevant postcode CI workflow does not run this check.
- Frontend static production build, project lint (pre-existing warnings only), Worker typecheck/dry-run build and whitespace checks run before handoff. Worker build is a dry run, not a deployment.

Browser, routing, payment, address-provider and notification tests use isolated data/mocks. No live payment or message was sent. Initial browser test harness issues (inactive-rule default, filter accessible labels and mock credentials for protected server routing) were corrected; the final full flow passed. Temporary test routes are removed before build and are not shipped.

## Release and later activation

1. Review the corrected branch and approve release separately. No push, merge or deploy is authorised by this report.
2. Require postcode CI, existing regression checks and both builds to pass on the reviewed commit. Historical compatibility tests require full git history; the dedicated PR workflow fetches it.
3. Deploy frontend and Worker through the approved release workflow. Either order preserves the current six fares. During frontend-first rollout the new postcode editor is temporarily read-only; reload after Worker deployment. Avoid concurrent pricing edits while replacing the backend.
4. Do **not** reset settings, seed rules, import prices, save OFF, or turn ON manually merely to release this fix. Missing legacy switch + six existing enabled rules already means effective ON. No migration/save is needed; version 205 and the configured Estate supplement remain stored untouched.
5. After both deployments finish, confirm six outbound rules, effective ON, current Estate supplement and no additional active rules. Check fresh BT1/BT2 quotes for £35/£45 BHD, £55/£65 BFS and £245/£255 DUB, plus BT10/BT12, reverse one-ways and return parity. Do not make a real payment solely to test release.
6. Later draft/reverse additions remain inactive until separately reviewed, explicitly approved, enabled and saved. Loading drafts preserves existing keys and does not change the switch.
7. An intentional OFF save disables all overrides, retaining rows. An intentional ON save enables only individually enabled approved rules. Existing short quote-cache propagation behaviour is unchanged.

No additional fare approval is assumed. Future reverse fares and every other district require individual review; a successful representative-route preview is not approval.

## Files modified / added

- `.github/workflows/postcode-pricing-review.yml`
- `shared/postcode-pricing.ts` and its Worker mirror
- `shared/owner-pricing-config.ts` and its Worker mirror
- `shared/website-fare-breakdown.ts` and its Worker mirror
- `shared/open-website-payment-fares.ts` and its Worker mirror
- `src/components/OwnerPostcodePricingPanel.tsx`
- `src/components/OwnerPostcodeProfitabilityPreview.tsx`
- `src/components/QuoteCard.tsx` (trusted fixed-pence display flag only; no layout/wording change)
- `src/components/QuoteFareTrust.tsx` (forwards that flag to existing fare composition)
- `src/lib/postcode-pricing-drafts.ts`
- `src/lib/postcode-pricing-csv.ts`
- `src/lib/owner-pricing-api.ts`
- `src/lib/pricing-preview-store.ts`
- `src/lib/quote.ts`
- `workers/addresses/src/owner-pricing-store.ts`
- `workers/addresses/src/owner-pricing-handlers.ts`
- `workers/addresses/src/postcode-preview.ts`
- `workers/addresses/src/profitability.ts`
- `workers/addresses/src/index.ts` (server-derived fixed-pence flag for composition and checkout)
- `scripts/check-postcode-pricing.ts`
- `scripts/check-postcode-pricing-browser.cjs`
- `scripts/check-postcode-management.ts`
- `scripts/check-postcode-release-compatibility.ts`
- `scripts/postcode-legacy-harness.cjs`
- `POSTCODE_PRICING_MANAGEMENT_REVIEW.md`
