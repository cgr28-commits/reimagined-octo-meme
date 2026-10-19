# Desktop quote refinements - PR #658

Extends `487fa68d` on the existing `codex/desktop-homepage-quote` branch. Current main remains `41990f4c`, including PR #657. Draft only; no merge/deployment authorised.

## Layout and readability

All new layout rules are inside `@media (min-width: 1024px)`. The quote has a centred 704px maximum width, reduced outer padding/gaps and desktop-only side-by-side pickup/drop-off fields. Address lookup, swap and keyboard handlers are unchanged. Vehicle cards remain vertically stacked with smaller empty frames. The selected glossy vehicle image remains large, fully contained and switches with the same desktop background. No image asset changed in this refinement.

Desktop removes an inert alternate-state height reservation and the duplicated short capacity line; the full passenger/luggage description remains visible. Mobile retains its original capacity presentation. Vehicle names are 20px; capacity/supporting copy 15-16px; fixed price 42px; booking action 18px; bottom actions and breakdown 15px. No transform is applied to scale the quote tool.

## Same-page enquiry

Email Enquiry uses the existing `QuoteActionDialog`, also used by View Route and Save Quote. Name/email/optional message and the current journey/fare/vehicle/party/return context stay in the popup. Opening/closing never changes the quote or navigates. No external email-app link remains inside this popup. Fields use the same visible navy/border treatment as Save Quote with explicit focus outlines. The trigger announces its expanded state.

Existing name/email/length validation, loading lock, confirmed-email success and clear provider/network/timeout feedback remain. Portal submission stops propagation into the booking form. The existing secure inbox endpoint and payload are unchanged; no booking job/payment payload is submitted.

Browser-only intercepted responses tested success and a provider failure without delivering enquiries. The captured payload included the current route, Saloon, two passengers/two suitcases and GBP235. A deliberately paused request tested timeout feedback. Required-name/invalid-email validation, disabled loading action, focus wrap in both directions, Escape, close and return-to-quote were tested. Focus returns to Email Enquiry and the quote remains selected at GBP235. All interception was cleared after testing.

**Outstanding publication blocker:** actual email delivery through the existing endpoint remains unverified from the earlier PR work. Mocked browser success is not evidence of real inbox delivery. This update does not change backend permissions or fix that separate integration issue.

## Validation and review evidence

- Desktop 1024/1280/1440/1920 and mobile 320/375/390/430 checked. Before/after screenshots and measurements are in the task's `desktop-quote-refinements/` visualization folder, with a gallery. Main mobile comparison uses the previously captured current-main baseline, not a different revision.
- Measured full quote height before/after (px): 1024: 2160.68/1741.47 (19.4% shorter); 1280: 2230.13/1795.78 (19.5%); 1440: 2272.13/1805.47 (20.5%); 1920: 2310.53/1805.47 (21.9%). Maximum width is 704px, previously 736/800/800/864px respectively. The large selected vehicle remains visible and contained at every width.
- All four mobile hero, vehicle-list and result dimensions match main. Original image sources, typography and button sizes remain unchanged; no horizontal overflow.
- All four desktop vehicle choices/backgrounds are captured at all four widths. Address suggestions and keyboard selection, View Route and Save Quote popups, enquiry context updates and booking handoff pass. Estate one-way GBP242 and return GBP475; breakdown shows GBP486 minus GBP24.30 (5%) plus GBP13 charges, rounded as before. No real email/booking/payment was submitted. Final browser error log is empty; the expected mocked provider-error response was confined to the earlier local UI test.
- Thirteen targeted regression scripts pass: mobile quote UI, pricing/vehicle quote flow, configurable owner pricing, minibus capacity, luggage capacity, return offer/address/journey UX, SumUp conversion, child-seat booking/SumUp, checkout, technical SEO and desktop enquiry.
- Configured Estate fixtures test GBP7/GBP10/GBP7; return discount remains 5%. Pricing/admin/vehicle-capacity/booking/Worker/SumUp implementations are untouched.
- Production static export: 148 pages. Existing unused-variable/hooks, AddressInput aria-selected and static-export headers/redirects warnings remain. OneDrive cache locks/readlink caused an intermediate build failure; clearing only the verified generated `.next` cache resolved it.
- Export scan: 7,576 internal hrefs resolve; 102 unique sitemap URLs. Generated sitemap drift restored before commit.

Keep PR #658 draft for visual approval and real email-delivery verification. No live settings, backend permissions, redirects or payments changed.
