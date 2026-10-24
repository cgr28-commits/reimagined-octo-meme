# Optional airport terminal access review

Draft feature, stacked on PR #680 (`fix/precise-quote-locations`, f4137d25). Do not merge either PR or deploy the frontend/Worker to production without owner approval. This branch also includes the approved homepage presentation from PR #691 at 054023ab so the preview shows the current design alongside terminal access. Neither dependency branch is modified. Reconcile both dependencies before release; do not merge this feature into either dependency branch.

## Booking behavior

The initial Belfast quote is the existing vehicle fare, retaining mileage, minimum fares, supplements, schedules and the 5% return discount. Belfast access is no longer mandatory, including at either end of airport-to-airport journeys. Dublin parking and toll behavior stays unchanged.

Inside booking details, each Belfast visit has free Long Stay access by default and an optional Terminal Access radio choice. Pickup visits have Meet & Greet directly above Terminal Access; selecting it replaces standalone access and charges its configured inclusive price once. Drop-offs cannot buy Meet & Greet. Returns and airport-to-airport trips retain independent visit selections.

Owner pricing gains `terminalAccess.bfsGbp` (£5 default) and `terminalAccess.bhdGbp` (£4 default), with validation, public configuration, audit labels and backward-compatible storage. Old admin clients retain existing prices. No live configuration is changed by this PR.

The Worker resolves airport identity and visit eligibility from the authoritative journey, recalculates extras from server settings, compares the accepted total, and then creates SumUp checkout. Signed vehicle-fare receipts and payment verification remain. Browser amounts for access are ignored. Optional service prices retain their exact pence after existing vehicle-fare rounding; they receive no return discount.

Server-calculated visit snapshots are saved in pending checkout and the paid booking, rendered in customer/owner confirmations and admin details, and included in driver instructions. Existing legacy per-leg fields remain for compatibility. Paid bookings are not migrated or repriced.

## Official location evidence checked 24 October 2026

- Belfast International: https://www.belfastairport.com/parking/pick-up-and-drop-off — official indexed content confirms a 15-minute Long Stay grace period for both pickup and drop-off. Direct retrieval returned 403. The free location is away from terminal doors. The official indexed Long Stay page (https://www.belfastairport.com/parking/long-stay-car-park) describes a 4-minute walk; this approximate time is shown. Do not state an unverified exact walking distance.
- Belfast City: https://www.belfastcityairport.com/Parking/Our-Car-Parks/Long-Stay-Car-Park — both directions, any empty Long Stay bay, exit within 10 minutes. A marked walking path takes approximately 5–10 minutes. Re-entry within 15 minutes is chargeable. https://www.belfastcityairport.com/Parking/Drop-Off-and-Pick-Up confirms the £4 paid area for up to 10 minutes.
- Outstanding before release: obtain measured walking distances for both free locations. None is invented in the interface. Confirm operator-specific access permissions and passenger coordination for avoiding overstays; airport grace periods are not a promise of unlimited free waiting inside the car park.

## Preview and release scope

This branch's Vercel preview has a read-only `/api/preview-addresses` adapter using the existing server-only `GOOGLE_MAPS_API_KEY` and the shared strict Google resolver from #680. The old live Worker omits `types` and `placeName`, which correctly fail the new premise validation. Preview autocomplete/details now use matching code rather than loosening that check. A conditional `preview.ts` page extension excludes this endpoint from static and production builds; the handler also rejects non-preview environments. The adapter cannot create bookings, send email or charge payments. Production Worker changes still require a separate approved release.

The Vercel preview deploys the frontend only. The Cloudflare Worker is not deployed by this PR; do not attempt a real booking or payment against production from a preview. Automated tests intercept all external requests and exercise the changed Worker in memory with mock SumUp, email and KV. A coordinated frontend/Worker release is needed after approval. WebKit tests emulate iPhone-sized viewports; they do not constitute testing on a physical iPhone.

## Verification

- 432 signed quote → mocked SumUp verification → paid booking → customer/owner email cases: BFS/BHD/DUB, pickup/drop-off, Saloon/Estate, single/return, all independent choices, default and fractional configured prices. Confirms stale settings cannot reprice a paid checkout, browser fee tampering is ignored, and repeated finalization does not duplicate emails.
- 72 airport-to-airport combinations, per-visit isolation, no duplicate charges, free defaults, M&G inclusion, configuration validation and 5% discount exclusions.
- Existing Meet & Greet/configuration and precise-location/minimum-fare regressions.
- TypeScript, lint, static frontend build and Worker dry-run build.
- Chromium and WebKit at 375px and 390px: initial fare, free default, paid selection, removal, return M&G inclusion, native date/time values and no horizontal overflow. Screenshots retained as CI artifacts.
