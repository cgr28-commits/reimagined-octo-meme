# Desktop homepage background and heading review

Base: origin/main ecb494db (merged/deployed PR #658, including e464e12c). Branch: codex/desktop-clean-homepage. New draft PR only; PR #658 stays merged.

## Changes

Only desktop (min-width:1024px) presentation changes: remove the four selection-dependent homepage background-image rules and their pseudo-element overlay. Hide the existing hero photograph/scrim on desktop and show a static branded navy/blue gradient. Mobile remains navy with its original markup/styles; the tablet photograph remains available. No image assets are replaced or deleted. All four calculator selection images and the large selected-result image remain unchanged.

Reduce the desktop green heading to responsive 14–18px, with nowrap and centred alignment. Desktop displays the exact requested “PRIVATE AIRPORT TRANSFERS BELFAST & NORTHERN IRELAND” wording. The existing mobile/tablet variants, main headline, description and all quote UI remain unchanged.

## PASS/FAIL

| Requirement | Result | Evidence |
| --- | --- | --- |
| Clean desktop navy/blue background | PASS | No visible hero photograph or oversized vehicles at 1024/1280/1440/1920; overlay content:none |
| Remove selection background switching/flickering | PASS | 48 rapid switches across four widths, identical computed gradient, no animation/transition, no blank background observed |
| Stable quote layout while switching | PASS | Per-width vehicle-list top stable within 0.001px; list and result heights stable across all four categories during sampled rapid switches |
| Keep calculator vehicle imagery | PASS | All four selection/result assets retained, selected image changes appropriately; loaded natural widths nonzero |
| Smaller single-line green heading | PASS | One text rectangle at every desktop width, no overflow; exact wording/colour retained, centred within 0.01px |
| Mobile 320/375/390/430 unchanged | PASS | Fresh current-production and revised full-page quote screenshots have identical dimensions and hero/list/result heights; 375/390/430 pixel-identical, 320 mean pixel difference0.005 on 0–255 scale |
| Mobile WhatsApp / wording / navigation / booking | PASS | Original labels, “Your own pre-booked transfer”, image sources and controls retained; WhatsApp popup/link and mobile booking handoff work |
| Quote generation / vehicle eligibility / pricing | PASS | Real address lookup and read-only quote generation; Saloon235/Estate242; eligibility/configurable supplement/return suites pass |
| Desktop email popup and booking handoff | PASS | Same-page existing popup opens with current Estate242 journey context, closes without losing quote; booking handoff works; no email/booking submitted |
| Regression suites / production build | PASS | All 19 targeted suites; static export148 pages, existing warnings only |
| SEO / structured data / sitemap / backend | PASS | Source unchanged; technical SEO check passes; generated102-URL sitemap drift restored before commit |

Pricing/booking/vehicle eligibility/Worker/SumUp implementations, all assets and SEO are unchanged against base. Configurable Estate tests retain £7/£10/£7 fixtures and 5% return coverage. No hardcoded supplement added. No payments, email delivery, booking creation, settings writes, redirects or deployments performed. Production remains unchanged.

## Existing issues and limits

The desktop navigation is crowded/overlapping at 1024px in both the current-production baseline and revised view. This pre-existing Header issue is outside the focused background/heading correction; no navigation changes included. Wider desktop screenshots show the normal navigation layout.

Build retains existing unused-variable/hook warnings, AddressInput role-option aria-selected warning, and static-export headers/redirects limitations. No new compile errors or test failures. Browser error/warning log was empty. The flicker check combines visual inspection with sampled computed background/geometry evidence; no animation or image-switch code remains in the desktop backdrop.

## Evidence

Visualization folder: desktop-clean-homepage/index.html. Includes fresh production before and local production-build after screenshots, full-page quote views at eight widths, four mobile comparisons, heading-metrics.json, rapid-switch-metrics.json, before/after-metrics.json and regression-results.json.

Ready for owner review as a new draft PR. Do not merge or deploy without explicit approval.
