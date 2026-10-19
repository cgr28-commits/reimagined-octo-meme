# Dublin Airport SEO — PR #657 revised review

19 October 2026. Draft; owner approval required before merge or deployment.

## Final scope

- Keep the original Dublin Airport photograph and standard airport-page hero styling. `public/images/hero/dublin.jpg` and all six `dublin-airport-{960,1920}.{avif,webp,jpg}` variants match pre-redesign release `856a26f2` byte for byte. Original source SHA-256: `113037026d2671931927bb8468a659ebf1111cfbec861abafb2029e5bc599ef8`.
- Remove the new premium presentation, all added terminal/AI/composite/interior assets, their optimizer, image captions and representative-image notices. Both Belfast directional pages also use their original airport hero. No new imagery is included.
- Retain Dublin SEO title/description, H1, practical departure/arrival and Terminal 1/2 guidance, luggage/booking advice, toll and return-discount explanation, and contextual links between the hub and both Belfast directional pages. No Derry–Dublin promotion or new landing URLs.
- Keep the existing quote calculator near the top of the Dublin hub, after its normal introduction and quote CTA. One calculator; pickup/drop-off/passengers/suitcases at quote stage, date/time at booking stage.
- No pricing, capacities, admin, quote-engine, booking, Worker or SumUp implementation changes. No canonical, structured-data generator or sitemap-generator changes.

## Validation

- PASS: technical-seo, locations-crawl, airport-hero-images, landing-quote-cta, homepage-mobile-quote-ui, pricing-vehicle-quote-flow, owner-pricing, return-offer, quote-journey-direction, sumup-booking-conversion, child-seats-booking-sumup, quote-checkout-page.
- Configurable Estate fixtures exercise £7 / £10 / £7 through saved runtime configuration and public/authoritative quotes; no live settings changed. Existing 5% return discount and capacity rules pass.
- GitHub Pages production build PASS: 148 static pages. Existing unrelated lint warnings (including AddressInput aria-selected) and static-export headers/redirects warnings remain.
- Export: 102 unique sitemap URLs; 6,194 internal anchor occurrences resolve. One H1/self-canonical per sitemap page; JSON-LD parses. All airport/transfer pages accessible in export. Existing tracked/generated sitemap drift is unchanged; build-generated source XML restored rather than introducing unrelated sitemap edits.
- Browser: desktop 1440×1000, mobile 390×844 and 360×800; original image loads, no horizontal overflow, one calculator, quote jump and directional navigation work. No new imagery or image-specific notices remain.
- Mobile quote smoke test on already-authorised localhost:3000: select Belfast City Hall address suggestion, Dublin Airport, 2 passengers/2 cases; Saloon £235, Estate £242. Estate Return: journey fare £486, 5% saving £24.30, fixed charges £13, rounded total £475. Proceeding opens booking details with date/time and the existing confirmation/payment button. No customer data entered, real booking submitted or payment initiated.
- Screenshots saved outside Git in `pr-657-original-image/` within this task's visualization folder: desktop/mobile full-page, top views and mobile quote view.

## Publication status

PR remains draft. No merge, deployment, live pricing/backend changes or redirects authorised or performed for this revision. The earlier Vercel preview shows the superseded image design; it was not refreshed and must not be used to approve this revision. Use the new local screenshots for this review.
