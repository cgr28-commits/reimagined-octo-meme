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
