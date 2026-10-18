# Belfast Grand Central Station landing page — review handoff

Status: implemented locally; NOT deployed, pushed or merged. Release is pending the checks below.

Base commit: 72670ed0798b73dea8ac6b30974c0f3ff393eace. Branch: feat/grand-central-station-landing.

## Page and metadata

Intended URL: https://www.myairporttaxini.co.uk/belfast-grand-central-station-taxi/

The trailing slash follows the existing GitHub Pages export convention; no alternate route was added.

Title: Belfast Grand Central Station Taxi | Book Transfers Online

H1: Belfast Grand Central Station Taxi Transfers

Description: Book a taxi to or from Belfast Grand Central Station. Fixed-price private transfers across Greater Belfast, online booking and secure payments.

A navy hero, embedded existing calculator, white content sections, emerald calls to action, 13 two-direction route cards, arrival/departure guidance, benefits, nine FAQs and final booking CTA are implemented. The existing header/footer and quote navigation are reused. No phone number is newly promoted. An offline visual preview is supplied as Grand_Central_Station_Preview.html, extracted from the built page with styles/assets embedded and scripts, form controls and external navigation disabled. It is a design review artifact, not a functioning booking test. A genuine 4032 × 3024 CC0 station photograph by RooneyDonal21 is now included in the hero, served as 640/1280/1920px WebP derivatives with descriptive alt text, intrinsic dimensions and provenance recorded in public/images/station/IMAGE-LICENSE.md. It is not presented as a pickup-point map.

## Research and search intent

Research checked 18 October 2026. These are qualitative intent findings, not measured search volumes or ranking guarantees.

- Primary booking intent: Belfast Grand Central Station taxi; taxi to/from Belfast Grand Central Station; Grand Central Station Belfast transfers.
- Connection intent: station to Belfast International, Belfast City and Dublin Airport; station to Newtownabbey and surrounding towns. Both directions appear on one substantial station hub rather than separate thin route pages.
- Informational intent: where to meet, luggage, payment, return journeys and delays. Clear identification of Grand Central versus Lanyon Place and Grand Central Hotel addresses a potential booking mistake.
- Existing source tree has no Grand Central Station landing page. Searches found only Grand Central Hotel references in test/demo data. Existing airport/town hubs and Belfast airport route pages remain intact. The new page focuses on the station connection and links to airport guides rather than duplicating their general airport content.
- AirportTaxiExpress has a general Belfast transfer page mentioning station pickups, fixed fares and advance booking. FindTransfers exposes station-to-destination comparison pages. Value Cabs' Belfast Chamber profile explicitly includes Grand Central among its transport hubs. These show competition from broad city-service pages and route aggregators. The opportunity is precise station access guidance and an immediate quote in one station-specific page. No claim is made that dedicated fonaCAB or Value Cabs station pages do not exist; search did not establish them.

Sources:
- https://www.translink.co.uk/using-translink/station-finder/belfast-grand-central-station — current station access and Enterprise/X1/X2 reference.
- https://www.translink.co.uk/infrastructure-and-projects/current-projects/bgcsupdates/important-project-updates — access updates; includes general bays and public-hire rank distinction.
- https://www.irishrail.ie/en-ie/station/belfast-grand-central — station identity and BT12 5AX.
- https://airporttaxiexpress.co.uk/belfast/ — competitor city/transfer positioning (not used as authority for station facts).
- https://www.findtransfers.com/transfers/from-belfast-grand-central-station-to-ballymoney — route comparison competitor.
- https://belfastchamber.com/member-directory/value-cabs-limited/ — Value Cabs station service reference.
- https://developers.google.com/search/blog/2023/08/howto-faq-changes — FAQ rich results restricted to authoritative government/health sites. Visible HTML FAQs added without FAQPage markup.
- https://www.myairporttaxini.co.uk/ — existing service, payment and waiting policies.

## Integration and SEO

The page mounts the unmodified QuoteCard with presentation="homepage". Customers confirm both places and passenger/luggage counts, then select dates/time during booking. No fake quote, independent payment form, new pricing tariff, station airport code or booking API was introduced. Route buttons scroll to the same calculator; they do not prefill or silently confirm an address. Standard Saloon/Estate capacity is described as four; the shared calculator continues to honour existing live vehicle availability.

Read-only production lookup returned the station as the first suggestion:
- Place ID: ChIJ27EsMwAJYUgR555gdyj3wJE
- Display address: Belfast Grand Central Station, Weavers cross, Belfast BT12 5AX, UK
- Coordinates: 54.5949003, -5.9394709

These identify the station, NOT a lawful vehicle stopping point. No new coordinates or quick-pick overrides were added to production code.

The layout already supplies one TaxiService/LocalBusiness entity; the page adds a Service referring to its existing business ID and BreadcrumbList. Title, description, canonical, Open Graph and Twitter metadata are supplied. The homepage and BFS/BHD/DUB airport guides link into the page; the sitemap generator and XML include it. No route variants, FAQ rich-result promises or fabricated reviews/fares/times were added.

SumUp Hosted Checkout, customer confirmations, booking management, WhatsApp notification logic, airport fees are untouched. The shared Estate fallback was corrected from £10 to the user-approved £7; configured live values still take precedence. No new station tariff was added.

## Verification

PASS:
- Full GITHUB_PAGES=true npm run build; station included among 148 generated pages. Existing repository lint warnings remain.
- TypeScript no-emit check.
- Exported HTML: one H1, one description/canonical, exact title, one calculator, nine HTML FAQs, parseable schema and correct existing business reuse.
- Exported internal link targets and incoming homepage/BFS/BHD/DUB links; sitemap inclusion.
- Live read-only address suggestion AND details resolution to Belfast BT12 5AX.
- New offline station checks: named place is complete; not an airport; station/local journeys classify correctly in both directions; BFS/BHD/DUB classify correctly in both directions; no station-only airport fee.
- Offline fare invariants with synthetic distances and the corrected default £7 supplement: Saloon/Estate difference and 5% return calculation in both directions. Synthetic metrics are not real route quotes.
- Existing schedule/first-price gate, flight-field-stage and required-field checks.
- Full universal distance-pricing and airport fixed-cost checks with the approved £7 fallback.
- Existing mocked SumUp booking-conversion checks. No real conversion was emitted by these mocked checks.
- git diff --check.

NOT VERIFIED:
- Desktop/mobile browser rendering, screenshots, CTA scrolling/hydration and autocomplete clicks. The required managed browser preview capability is unavailable; no alternative browser was installed or preview server started.
- Actual road-route prices and server-authoritative station quotes across all destinations.
- Full booking progression, availability approval, SumUp hosted checkout page and post-payment notification delivery. No booking, checkout session, payment or notification was created.
- Google Rich Results Test/Search Console validation and live indexing (page not deployed).

## Release issues

1. Fallback discrepancy resolved locally: live /pricing/public v211 has estate.upliftGbp=7 and returnDiscount.rate=0.05. The shared fallback now also uses £7, with regression coverage. No live settings changed and no new pricing rule is needed. Worker builds copy the shared source through the existing sync script; that build/deployment is not performed here.
2. Confirm the operator's actual permitted collection procedure. Translink distinguishes general drop-off bays from a public-hire rank; its guide alone does not establish one guaranteed private-hire collection bay. Copy uses an agreed meeting point, not a promise to use the rank or a specific bay. Confirm how each passenger gets that instruction operationally.
3. Finish browser and isolated booking/checkout testing before approval to deploy. Opening a PR must account for this repository's auto-merge workflow; no PR was created here.

## Files changed

- src/app/belfast-grand-central-station-taxi/page.tsx
- src/app/belfast-grand-central-station-taxi/station.module.css
- src/components/PopularBelfastTransfers.tsx
- src/app/airports/[slug]/page.tsx
- scripts/generate-sitemap.mjs
- public/sitemap.xml
- scripts/check-grand-central-station.ts
- scripts/check-airport-fixed-costs.ts
- shared/universal-distance-pricing.ts
- docs/grand-central-station-review.md

## Next SEO improvements

After approved publication: submit the canonical page in Search Console, check indexing/canonical selection and monitor station-query impressions and bookings. Use actual query data before adding any further route page. Add a genuine licensed station photograph only if it improves the design, with responsive AVIF/WebP sizes and descriptive alt text. Recheck Translink access guidance when arrangements change. Avoid train-monitoring or station meet-and-greet claims unless operations actually support them.


## Follow-up verification after c67f1df

The commit was inspected directly: it changes UNIVERSAL_ESTATE_PREMIUM_GBP from 10 to 7. The existing 0.05 return configuration is asserted in the station tests. Station tests, universal distance tests and airport fixed-cost tests pass. The high-resolution CC0 image has now been added; the full export build passes with the image, and the offline design preview was updated.

Additional isolated script results:

| Check | Result |
| --- | --- |
| Station pickup/drop-off classification and £7/5% calculations | PASS |
| Pricing vehicle quote flow | PASS |
| Quote journey direction | PASS |
| Child-seat and mocked SumUp handoff checks | PASS |
| Mocked SumUp booking-conversion checks | PASS |
| Schedule and first-price gates | PASS |
| Legacy checkout-page source assertions | FAIL: expects literal `Step 3 — Complete your booking`, absent from current QuoteCard; the step label is rendered from the existing step array |
| Legacy authoritative-fare source assertions | FAIL: expects an old exact CSS font-size clamp; current fare display uses a different clamp |
| Desktop/mobile browser and screenshots | BLOCKED: supported browser-control skill/tool unavailable |
| Full isolated browser quote-to-hosted-checkout | BLOCKED: no browser harness or isolated checkout service available in this session |

The two failed scripts were not rewritten to claim a pass. QuoteCard and QuoteResultShowcase are unchanged from the baseline for these assertions; this does not establish that every later assertion or real checkout behaviour works. Their failures remain recorded pending browser review.

Current official Translink station guide and project-update page were reread on 18 October 2026. They identify Boyne Bridge Place general drop-off spaces, a ten-minute maximum stay, and separate public-hire taxi rank spaces. They do not explicitly establish one permitted Class C/pre-booked pickup bay. The project update page still contains June/Summer 2026 works references, so its presence today is not proof those works remain active. No specific private collection point has been claimed. Operator confirmation of a lawful collection location and passenger instructions is still required.

No real payment, booking, customer email, live conversion, merge, push or deployment was performed. Browser screenshots have not been fabricated or substituted with the offline design preview. To complete the release checks, this branch needs a browser-enabled development session and an isolated/mock backend that blocks real payment, messaging and conversion endpoints.


## Vehicle options update

Station page now explicitly offers Saloon/Estate (up to four), Business Class (up to three and two large suitcases), and 7 Seater Minibus (up to seven plus driver), subject to existing live availability. Removed the page-specific maxPassengers=4 override so the shared calculator uses its normal capacity configuration. Added three vehicle cards and two FAQs; eleven FAQs now appear. No vehicle tariff, availability, notice period or airport benefit rules were changed.

Vehicle-update checks: all public minibus-capacity checks and all 12 combined pricing/vehicle/quote-flow checks pass. The minibus regression fixture was updated from £93 to £88.35 because its £50 synthetic Saloon input now uses the approved £7 fallback, retaining the existing ×1.55 formula. No live pricing setting changed.

## Branding follow-up, 18 October 2026

Compared the station styling directly with the homepage, HeroSlideshow, SectionHeading, PopularBelfastTransfers, WhyChooseUsSection, global theme and shared LandingPageQuoteCta. Station sections now use the shared navy/emerald palette, white text, translucent bordered cards, Cormorant display headings, inherited Manrope body type, and homepage desktop/mobile gutters. Shared header, footer, quote calculator and CTA components remain untouched. No gold/yellow accents were introduced.

Searched Wikimedia/Geograph and the wider web for a commercially licensed evening exterior. No suitable evening replacement was verified. Retained the documented CC0 photograph and all three responsive WebP sizes; adjusted the sizes hint for the new gutters. Image decoding and dimensions checked; browser cropping remains unverified. McAslan image was not downloaded or used.

Production build PASS (existing lint/export warnings). Offline checks PASS: station directions and £7/5% invariants, public minibus capacity, pricing/vehicle/quote flow, Business Class passenger limits, landing quote CTAs, mocked SumUp conversion handoff. Three existing checks FAIL: luggage-capacity fixture expects 93 instead of 88.35 with the £7 fallback; checkout source assertion expects an absent literal step heading; authoritative-fare assertion expects an older font-size class. Shared source and tests were not changed for this branding work.

Browser QA remains BLOCKED: managed Sites environment lacks required control-browser capability. No browser server or alternative automation was started. Static preview regenerated from this successful build, with controls disabled and a restrictive CSP. It is not browser QA or an interactive checkout test. No production calls, payments, emails, conversions, push, merge or deployment were initiated. Build-generated sitemap changes were reverted to the exact pre-build tracked version.

## Assertion investigation and complete suite follow-up

The three targeted test files now pass after verified expectation-only corrections. No pricing, booking, availability or SumUp implementation changed. See `grand-central-station-test-results.md` for all 254 outcomes: 186 pass, 48 fail, 20 blocked, including baseline checks and browser-runtime failure evidence. Updated static preview offers desktop/mobile viewports; browser QA still has not passed.
