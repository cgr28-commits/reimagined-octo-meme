# Desktop vehicle image review - PR #658

Extends branch `codex/desktop-homepage-quote` from `5b947450`. Desktop starts at 1024px. No merge or deployment authorised.

## Asset provenance

The built-in image-generation editing tool used the four existing approved `public/images/vehicles/quote-{saloon,estate,business-class,minibus}.webp` images as references. Visual inspection retains the same black vehicle models/categories, body shapes, angles, wheels and existing branding. These are edited representative category images, not a guarantee of a particular allocated car. No airport buildings, new passengers or service claims were introduced.

Editable PNG outputs: `design/desktop-vehicles/`. Original images and mobile transparent cutouts are unchanged. The existing `flyer-vehicle` full photographic scene has no white studio box and remains unchanged.

Editing prompt (category substituted for vehicle name):

> Use case: background-extraction / precise-object-edit. Edit target: the attached existing vehicle photograph for a taxi website. Create a high-resolution desktop-only transparent cutout of EXACTLY THIS SAME vehicle. Preserve its model, body shape, black paint colour, camera angle, wheels, grille, badges, number plate lettering if present, windows, proportions and all identifying details. Do NOT substitute or redesign the car. Remove the white/grey/checkerboard studio background entirely, including white fringe/halos. Keep a very subtle realistic neutral contact shadow on genuine alpha immediately under the tyres, no opaque floor. Refine only photographic presentation: crisp existing detail, clean antialiased edges, restrained glossy paint highlights and natural soft studio reflections matching the original. Not wet, not chrome, no added luxury equipment or props. Preserve the existing photograph faithfully; no invented bodywork or new branding. Full vehicle comfortably framed in a landscape 2:1 canvas, no crop of tyres, mirrors or roof. Genuine transparent background, not a black/white/checkerboard fill. Consistent soft daylight studio lighting.

`node scripts/optimize-desktop-vehicles.mjs` reproduces 640/960/1600px WebP and AVIF files using Sharp. All 24 published files have alpha, fully transparent pixels and are under 200 KB. Largest AVIF: 66,309 bytes; largest WebP: 163,248 bytes. Editable PNGs are outside public export.

## Implementation

Media-qualified picture sources cover quote cards/results, homepage category cards, Vito group-transfer figures and owner vehicle-card preview. Existing alt text, category labels and representative captions remain. New sources and visual rules apply only at 1024px and above. Original mobile/fallback sources, dimensions and handlers remain.

Larger contained desktop frames and soft shadows; responsive Tailwind scale/translate utilities ensure complete Business Class/Minibus vehicles fit the new canvas. Selected-result attributes continue driving the four matching desktop background images. Pricing, vehicle availability, capacities, admin configuration, booking and SumUp code are untouched.

## Validation

- All four categories captured before/after at desktop 1024/1280/1440/1920 and mobile 320/375/390/430. Desktop baseline is PR #658 before this update. Screenshots and DOM measurements are in the task's `desktop-vehicle-images/` visualization folder, with an HTML gallery.
- All 16 desktop category/width combinations load the new AVIF, fit their frames, switch matching backdrops and have no horizontal overflow.
- All 16 mobile category/width combinations retain identical original image sources. Result geometry differs by less than 0.001px from floating-point scroll measurements. Original mobile files are byte-unchanged. Visual comparison confirms the same layout/images; JPEG/subpixel raster differences are not layout changes.
- Homepage fleet and group-transfer image checked at all eight widths. Desktop white studio box is removed; mobile retains the original white-backed minibus and existing cutouts as required.
- 13 targeted regression scripts pass: homepage mobile UI; pricing/vehicle quote flow; owner pricing; public minibus capacity; luggage capacity; return offer, address confirmation and journey UX; SumUp conversion; child-seat booking/SumUp; quote checkout; technical SEO; desktop enquiry.
- Estate fixtures save/read/apply GBP7, GBP10 and GBP7 without hardcoded supplements. Existing 5% return discount/capacities pass. No live settings or permissions changed; no payments submitted.
- Browser address lookup, quote generation and booking handoff pass. Belfast City Hall to Dublin Airport, 2 passengers/2 cases: Saloon GBP235, Estate GBP242, Estate return GBP475. Booking stage retains fare/vehicle/journey and shows schedule/contact fields. Browser error log empty.
- Production static export passes: 148 pages. Export scan: 7,576 internal hrefs resolve; 102 unique sitemap URLs. Generated sitemap drift restored before commit.
- Existing unrelated unused-variable/hooks, AddressInput aria-selected and static-export headers/redirects warnings remain.

**Email delivery verification PASSED:** the business owner confirmed receipt of test enquiry MATNI-1049 in the business inbox. This supersedes the earlier unverified-delivery status. The working delivery integration is preserved; no additional real enquiries are sent during final corrections. See `desktop-final-corrections-review.md` for the final form-race fix and validation.
