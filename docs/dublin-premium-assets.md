# Dublin premium design — asset and publication record

Prepared 19 October 2026. Draft only; no publication authorised.

## Deliverables and provenance

All source files and optimised variants are in `public/images/dublin-premium/`.
Run `node scripts/optimize-dublin-premium.mjs` to reproduce the responsive assets.

| Asset | Terminal background | Foreground / status |
|---|---|---|
| A — hero | `sources/t2-exterior.jpg`: genuine Terminal 2 photograph | `car-480.webp` / `car-960.webp`: AI illustrative single estate car, separately layered in HTML |
| B — pickup | `sources/t1-entrance.jpg`: genuine Terminal 1 photograph | `assistance-480.webp` / `assistance-960.webp`: fictional AI driver, travellers, car and luggage, separately layered |
| C — comfort | No airport background | `interior-{640,960,1600}.{avif,webp,jpg}`: AI representative rear seating |

The terminal background pixels are never passed through generation in the shipped assets. Only crop, resize, orientation and format compression are applied to genuine photographs. Initial generative edit experiments were rejected as terminal backgrounds and are not shipped. The final page composes separate alpha foreground layers over the genuine source photographs; it does not use AI terminal approximations.

### Terminal 2

- Title: **Outside Terminal 2.JPG** — front exterior of Dublin Airport T2.
- Creator: **Ronan Menton (Menton)**.
- Required outside-Wikipedia attribution: **Dublin Airport T2.com** (source Permission field). Visible credit includes this name, the photographer, the photo title, source/licence links and a change notice.
- Source: https://commons.wikimedia.org/wiki/File:Outside_Terminal_2.JPG
- Licence: **CC BY 3.0**, https://creativecommons.org/licenses/by/3.0/
- Commercial copying and adaptation permitted with credit, source/licence link and indication of changes. No endorsement implied. Retain attribution when reusing.
- Metadata receipt: `sources/t2-exterior-metadata.json`, fetched from Wikimedia imageinfo on 19 October 2026.
- Delivered adaptations: `hero-*`, crop/resizing/compression; AI car is a separate illustration. Credits appear beside every use on the redesigned hub and both Belfast directional pages.
- Historical photograph, not current collection-location evidence. No meeting point is inferred from it.

### Terminal 1

- Title: **Exterior Dublin Airport T1.jpg** — Dublin Airport Terminal 1 exterior.
- Creator: **M901QX**.
- Source: https://commons.wikimedia.org/wiki/File:Exterior_Dublin_Airport_T1.jpg
- Licence: **CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/
- Commercial use and modification permitted, with credit, licence/source links, change notice and ShareAlike. Do not impose additional restrictions or imply endorsement.
- Metadata receipt: `sources/t1-entrance-metadata.json`, fetched on 19 October 2026.
- Delivered adaptations: `pickup-*`, cropped/resized/compressed. Photo and the combined illustrative presentation are offered under CC BY-SA 4.0; this notice grants reuse of any rights held by the project in that adaptation/foreground. It does not relicense website code.
- Existing distant/incidental public-space people in the genuine background are not represented as staff or customers. Added foreground people are fictional. No model/property release is asserted for the source photo. Copyright licences do not themselves grant endorsement, privacy or trademark rights.

## AI generation record

Built-in image generation tool, no API credentials or repository tokens used.

- Car: requested one dark modern estate at the genuine Terminal 2 photo, then extracted only the car to a transparent cutout. Final extraction prompt: “Extract ONLY the single dark estate car as a clean transparent-background cutout. Preserve this car, proportions, wheels and reflections. Remove absolutely ALL airport buildings, sky, road, white margins and every other background pixel. Tight bounding box around car with tiny margin. Include only a very subtle transparent contact shadow immediately under tyres. Real alpha transparency, no white/checkerboard background. No airport architecture anywhere.”
- Assistance: requested a professional driver helping fictional adult travellers with suitcases at the supplied Terminal 1 reference, then extracted only the foreground. Final extraction prompt: “Extract ONLY the foreground couple, professional driver, foreground estate car and their three suitcases as one clean transparent cutout group. Preserve foreground people's poses, car, bags, proportions and lighting. Remove ALL airport architecture, sky, road, signs, background people, railings, poles and other background pixels. Real alpha transparency, no white/checkerboard background. Tight framing around whole group including feet and wheels. A very subtle transparent contact shadow only. No terminal building or airport sign anywhere.”
- Interior: “Realistic bright daylight automotive interior photography, wide landscape 3:2. Rear passenger area of a modern executive-style saloon or estate, quality black leather rear bench, three proper seats with three headrests and three seatbelts, comfortable normal legroom, clean understated upholstery and stitching, soft daylight through windows, view from open rear door looking across seat. Realistic everyday executive transport, not limousine, not a van, no minibar or extravagant screens, no people, no brand logos, no motorway or airport buildings visible through windows, no text. Representative illustrative interior, not a named vehicle model. Do not exaggerate space.”

## Required owner review before publication

Genuine licensed terminal assets are available; no terminal placeholders are necessary.
No owner-supplied vehicle/interior or staff photographs were provided. The illustration shows an executive-style estate and leather seating; it is not evidence that a particular model, upholstery or luggage-assistance service is guaranteed. Visible captions state this, and copy asks customers to confirm particular assistance requirements.

Before approving publication, confirm the representative styling reasonably matches vehicles actually offered. If not, replace the corresponding car/interior image with an owner-authorised service photograph or a neutral placeholder. Do not remove the variation notices or source credits. No fleet section or fleet-size claim is included.

## Delivery and performance

Photographs: three sizes (640/960/1600) in AVIF, WebP and JPEG. Foregrounds: alpha WebP at 480/960. Hero is eager/high-priority; experience images and assistance foreground are lazy. Explicit dimensions and fixed aspect-ratio wrappers reserve space. No external image requests, extra client components or JavaScript animation were added. Source originals are archival inputs only and are never referenced by the page. Real-user Core Web Vitals require post-publication field data; local checks cannot guarantee an LCP score.

SEO baseline is the connected Search Console Web/final data for 19 September–16 October 2026 recorded in draft PR #656. This new PR includes that unmerged SEO commit plus the premium presentation; it replaces that proposal for review without closing or merging it automatically.

## QA record

- All 16 selected npm check commands passed: technical-seo, locations-crawl, town-landing-pages, landing-quote-cta, homepage-mobile-quote-ui, airport-hero-images, airport-fee-wording, airport-fixed-costs, airport-to-airport-pricing, pricing-vehicle-quote-flow, owner-pricing, return-offer, quote-journey-direction, sumup-booking-conversion, child-seats-booking-sumup and quote-checkout-page.
- GitHub Pages production build: PASS, 148 static pages; no new lint warnings after cleanup. Existing unrelated unused-code/hooks/address-option accessibility warnings and static-export headers/redirects warnings remain.
- Export: 102 unique sitemap URLs, one H1 and self-canonical per page, no duplicate titles/descriptions, JSON-LD parsed, all 6,511 checked internal anchor occurrences and image paths resolve. All four airport and 70 transfer pages HTTP 200 locally. Exactly one quote calculator on each affected page.
- Hub inspected at desktop 1440×1000 and mobile 390×844/360×800; directional routes inspected at desktop/mobile. No horizontal overflow or artwork over quote controls. Keyboard quote/directional links and arrival/departure prefill checked. All images loaded. Quote stage retains address/passenger/suitcase controls, with no date/time inputs.
- Contrast calculations for new normal text: body 9.48:1, captions 6.94:1, eyebrow 6.94:1, quote CTA 7.04:1. Existing JSX accessibility lint ran with build. This is targeted QA, not a claim of comprehensive WCAG conformance.
- Image budget: every new AVIF/WebP is below 180 KiB. Hero AVIF at 640/960/1600 is 16/29/59 KiB; car WebP 480/960 is 33/93 KiB; largest lazy assistance foreground is 159 KiB. Transparent alpha verified. Static page first-load JS remains about 297 kB (same as preceding SEO branch); no new client dependencies. Field Core Web Vitals not measured for an unpublished design.
- Local end-to-end quote limitation: production Worker responds to localhost with Access-Control-Allow-Origin set to https://www.myairporttaxini.co.uk. Browser address suggestions cannot complete from the local export. The public service itself returns HTTP 200 with suggestions; CORS/Worker settings were not changed. A complete new-design customer transaction should be smoke-tested on an owner-approved preview origin before publication; no bypass was used.
- Existing live Dublin journey smoke test (unchanged production UI): Belfast City Hall → Dublin Airport, 2 passengers/2 cases; Saloon £235, Estate £242. Return Estate base journey fare £486, 5% saving £24.30, fixed charges £13, rounded payable £475. No booking or payment submitted. Tests cover configured Estate £7/£10 values in memory, not live admin edits.
- Protected production code matches main: homepage fields, QuoteCard, shared/Worker logic, quote engine/service, vehicle selection, pricing config, structured-data and sitemap generators. No payment/admin/live pricing changes.
- Known source sitemap drift remains separate: tracked XML has 100 entries; unchanged generator emits 102 including existing Cork directional routes. Generated source edits restored, no sitemap changes in this PR.

## Final pre-publication review — PR #657

Review corrections: added the Terminal 2 source's specific required “Dublin Airport T2.com” attribution, alongside Ronan Menton, original title, source and licence links, on the hub and both Belfast directional pages. Corrected Open Graph alt text to describe the actual terminal-only social image. No imagery from the two subsequently supplied, unverified uploads was introduced.

Verified against the Commons file pages: Terminal 2 is Ronan Menton's genuine 23 November 2010 photograph, CC BY 3.0; Terminal 1 is M901QX's genuine 11 September 2022 photograph, CC BY-SA 4.0. Re-encoding the original source inputs reproduces the shipped 960px AVIF backgrounds byte-for-byte, confirming no generative terminal pixels. Credits/change and representative-image notices are visible at desktop 1440×1000 and mobile 390×844 / 360×800. All images load; no overflow or imagery over calculator/booking fields. No fleet-size or guaranteed chauffeur/model/leather claim. Owner should still approve the representative styling before publication.

### Preview authorisation and completed functional test

The prior port-4173 limitation is superseded. Read-only Vercel inventory found **no deployment for this PR branch**, consistent with its disabled automatic deployments. No deployment was created.

The existing backend explicitly permits **http://localhost:3000**, confirmed by a public address lookup response returning that exact Access-Control-Allow-Origin. Served the production export at that already-authorised origin, with no CORS, backend, account or pricing changes. Browser test of the **new design** passed: choose a real address suggestion, generate quote, select Estate, add Return and proceed to the booking details stage. Date/time remain at booking stage; final booking/payment was not submitted.

- Belfast City Hall → Dublin Airport, two passengers/two cases: Saloon £235, Estate £242.
- Current public pricing configuration: version 211, estate.upliftGbp = 7, returnDiscount.rate = 0.05. Live values read only.
- Return Estate: journey fare £486, discount £24.30 (5%), fixed charges £13, rounded payable £475. Booking form preserves the selected vehicle and total, and separates £4 outbound toll / £4 return toll / £5 pickup parking. No genuine booking or payment submitted.
- The existing automated configurable-Estate fixtures for £7/£10 pass without live setting edits; customer quote logic remains unchanged.
- Both directional links, back-to-hub links, correct airport prefill and updated source credits verified in browser. No browser errors.

For a future remote Vercel preview, first obtain owner approval to create the deployment and verify its project ownership and PR commit. Current CORS uses a project-name prefix matcher, not cryptographic Vercel ownership verification; do not treat an arbitrary matching hostname as trusted. Prefer an exact verified origin, ideally on an isolated preview Worker with only the required public address/quote routes. Any production allowlist change requires separate approval. No broad suffix wildcard, auth bypass, credentials or permission changes were added here. The existing prefix matcher merits separate security review; it is not introduced by this PR.

### Final checks and decision

13 selected npm check commands passed in this final review: technical-seo, locations-crawl, landing-quote-cta, homepage-mobile-quote-ui, airport-hero-images, airport-fixed-costs, pricing-vehicle-quote-flow, owner-pricing, return-offer, quote-journey-direction, sumup-booking-conversion, child-seats-booking-sumup and quote-checkout-page. Technical SEO was rerun after the review corrections and passed. Final production build passed with 148 static pages. Windows/OneDrive cache permission/readlink errors during a rebuild were resolved by removing only the verified generated .next directory; no source workaround was needed. Existing unrelated lint/static-export warnings remain.

Final export verification: 102 unique sitemap URLs, 6,511 internal anchor occurrences resolve, no duplicate titles/descriptions, one H1/self-canonical and parseable JSON-LD per sitemap page. Protected pricing, vehicle-capacity, homepage-field, booking, Worker, admin and SumUp implementation sources match main. No remaining selected-test failures or discovered booking regression.

**Decision:** technically safe to merge after owner approval of representative imagery/service fit. Keep draft until that approval; do not merge or deploy as part of this review. SumUp regression tests passed, but real payment settlement was deliberately not exercised.
