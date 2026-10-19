# Desktop homepage and quote review

Base: `41990f4c` (main, merged PR #657 including `72560b4a`). Branch: `codex/desktop-homepage-quote`. Draft only; no merge or deployment authorised.

## Changes

- Desktop starts at 1024px. Mobile/tablet geometry, existing heading copy, address component, vehicle eligibility component and result component are untouched. New enquiry button has `display:none` below 1024px; the existing bottom WhatsApp button is hidden only above that breakpoint. Header/help WhatsApp links remain.
- Desktop suggestion portal receives explicit navy background, white text, border/shadow, hover and keyboard-focus styles. Main's custom dropdown already computed to navy during baseline inspection; these rules make the intended desktop appearance explicit without changing address lookup/navigation handlers.
- Four desktop vehicle categories stack as horizontal image/copy/selection cards. Existing approved 1400×700 vehicle assets render larger; the selected vehicle image gets a much larger desktop frame. No new image assets or AI generation.
- Latest main has a fixed airport backdrop rather than vehicle-driven backgrounds. Desktop CSS now adds a subtle selected-vehicle backdrop layer using existing transparent assets, driven by the existing selected-result art attribute. Verified Saloon/Estate/Business Class/Minibus switch both result art and backdrop. The original airport image remains underneath; mobile receives no new layer.
- Desktop homepage emerald eyebrow uses larger balanced responsive typography. Exact existing wording/colour are retained. No mobile typography or spacing rules changed.
- Desktop Email Enquiry replaces only the bottom result-row WhatsApp action. Accessible existing modal provides name/email/optional message, quote context, validation, loading, success/error states, focus trap, Escape and focus restoration. Context includes confirmed fare (or on-request/pending status), addresses, vehicle, passengers, bags, return type and any already-entered travel dates. No additional date/time requirement at quote stage.

## Existing email integration and outstanding publication issue

The existing public Worker `/bookings` route accepts a generic name/message enquiry without a structured `booking` payload. It uses the current owner inbox/email delivery chain. That path may allocate an enquiry reference, but creates no booking job/calendar event or checkout when `booking` is omitted. No new endpoint, permissions, credentials, backend deployment or third-party browser fallback was added. Customer reply email is included in the email body; the existing backend chooses the owner recipient.

The frontend requires both `ok:true` and `emailSent:true` before claiming success. It does not treat a saved request as proof of email delivery. No automatic retry.

**Outstanding:** real, clearly marked QA enquiry attempts to the existing business inbox did not receive confirmation within the 20-second client timeout. Delivery/inbox receipt is unverified; the request might have reached the provider despite the timeout. Do not repeatedly retry or publish the new enquiry action until the existing route/provider is investigated and a real delivery is confirmed. Backend changes, if needed, require separate approval. No production backend or pricing settings were changed.

Validation covered native required/invalid email errors, disabled loading action, and the real timeout error. A temporary browser-only mocked response verified success rendering, Tab trapping, Escape closing and retention of the quote stage; the mock was cleared immediately and never reached production. An early UI test exposed React portal submit bubbling into the parent quote form; `stopPropagation` now isolates it, and the success retest stayed in the quote stage. No booking or payment was submitted.

## Validation

- Production static-export build: PASS, 148 pages. Final TypeScript/lint validation passes. Existing unrelated unused-variable/hooks warnings, AddressInput `aria-selected` warning and Next static-export headers/redirects warnings remain. OneDrive generated-cache readlink error on an incremental build was resolved by clearing only the verified `.next` directory; no source workaround.
- PASS: `node node_modules/tsx/dist/cli.mjs scripts/check-desktop-quote-enquiry.ts` (input validation, message context, no booking payload, confirmed-delivery success, HTTP/provider/network failures, desktop visibility/mobile WhatsApp and portal isolation guards).
- PASS: technical-seo, homepage-mobile-quote-ui, pricing-vehicle-quote-flow, owner-pricing, return-offer, quote-journey-direction, sumup-booking-conversion, child-seats-booking-sumup, quote-checkout-page.
- Export crawl: 102 unique sitemap pages; all 6,194 internal anchor occurrences resolve. Canonical/schema/sitemap implementation and airport content unchanged. No tracked sitemap edit; existing 100-tracked/102-generated drift remains outside scope.
- Desktop tested at 1024/1280/1440/1920; mobile at 320/375/390/430. No horizontal overflow; desktop cards stack, imagery is contained, selected state/capacities remain readable, enquiry replaces bottom WhatsApp only on desktop.
- Mobile before/after against main: identical hero, vehicle-list and result-card dimensions at every requested mobile width. Homepage captures match apart from negligible JPEG raster noise. The stable quote region matches pixel-for-pixel; remaining screenshot differences are the logo's keyboard-focus outline and existing rotating/lazy imagery farther down the page. No mobile layout, copy, button, image sizing or handler change. Existing mobile WhatsApp dialog/link tested.
- Browser: address suggestions and keyboard activation, quote generation, all four vehicle choices/backgrounds, fare breakdown, and booking handoff tested. Belfast City Hall → Dublin Airport, 2 passengers/2 cases: Saloon £235, Estate £242. Estate Return: £486 journey fare − £24.30 (5%) + £13 fixed charges, rounded £475; booking details show the same amount. No personal customer data or real payment submitted.
- Admin configuration fixtures exercise Estate £7/£10/£7 and capacity rules; pricing calculations, admin settings, Worker/shared code, booking calculations and SumUp implementation are unchanged.

## Review assets and delivery

Screenshots and JSON comparisons are saved outside Git under this task's `desktop-homepage-quote/` visualization folder. The HTML gallery includes full desktop before/after quote/home pages, all mobile pairs, address dropdown, enquiry form, real timeout and explicitly labelled mocked success. No preview deployed. Vercel automatic deployment disabled for this branch in `vercel.json`; Pages deploys only main.

Ready for visual/code review as a draft. **Not ready to publish the email action until real delivery is verified.**
