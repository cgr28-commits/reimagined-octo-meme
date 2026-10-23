# Save My Quote — review

Branch: `feature/save-my-quote-email-whatsapp`. No merge or deployment requested.

## Behaviour

- After a valid server-priced quote, a 20-second inactivity timer offers Save My Quote or Continue to Booking. Quote interaction/scroll resets it, hidden tabs pause it, and session storage suppresses repeat displays. Booking/payment stages suppress it.
- A compact navy/green reminder floats only where it does not intersect the quoted fare or booking controls. On cramped screens it uses an in-flow fallback. No animation; safe-area padding on floating placement.
- Email saving requests only an email address and uses the existing branded provider. WhatsApp saving requires no contact details and generates a mobile `wa.me` or desktop WhatsApp Web share link. A second explicit click opens sharing, avoiding asynchronous popup blocking; the customer selects the recipient and sends it.
- 192-bit random tokens, strict format checking, fragment-based website links, no-store lookup responses, expiry enforced on reads and payments, and bounded retention. IP and hashed-recipient hourly limits reduce abuse. No marketing subscription and no scheduled saved-quote reminders (including older saved quotes).
- Returning customers use the existing QuoteCard and normal server-validated payment flow. Restores the original locations and their selection metadata, dates, return leg, vehicle, passengers, luggage, child seats, flight numbers and selected Meet & Greet. Current fares are shown alongside an original-price comparison. No booking is created by saving.
- Owner booking settings include feature, popup, delay (5–300 seconds), validity (1–7 days), email and WhatsApp controls. Defaults: on, on, 20 seconds, 7 days, on, on. Failure to load public settings hides new saving controls. Changes do not extend existing quotes.

## Infrastructure and configuration

No schema migration, new binding, provider or secret. Uses existing TRACKING_STORE, booking:settings, owner authentication and email provider. Existing records missing new fields remain readable; incomplete old addresses may require reselecting an address. Update frontend and Worker together only after approval. The setting defaults apply when the new Worker is eventually deployed.

Pricing engine modules are unchanged. The saved-quote adapter now preserves selected vehicles, includes configured airport charges/discounts and validates route identities server-side. Legacy saved-quote checkout/requote endpoints also recalculate instead of locking the snapshot price.

## Validation

Locally passed frontend typecheck, lint (existing warnings), production static export, Worker typecheck/dry-run bundle, and 12 regression suites including new saved-quote integration, existing saved quotes, reminder suppression, configured evening/night pricing, Meet & Greet/payment, BFS minimum/payment, airport costs, deposit/cash, authoritative fare and child seats/payment. Email and SumUp were mocked; no real messages or charges.

`Save My Quote review` CI runs the integration checks and an intercepted-network Chromium test at 320, 360, 375, 390 and 1440 pixels. Screenshots are uploaded as `save-my-quote-screenshots`. It creates no deployment. Local Chromium browser checks pass at all five widths. The original runtime browser download failed; installing the compatible pinned Playwright browser succeeded. Screenshots below use mocked services and fictional quote data. CI repeats these checks; some unrelated workflow attempts encountered a Google-font download/build failure and were retried.

## Limits requiring review

- Real email inbox delivery and real WhatsApp application/web handoff require acceptance testing; automated tests check provider requests and generated sharing URLs.
- KV counters are best-effort across regions; per-isolate counters supplement them. Strict global atomic throttling would need an additional durable coordination service or platform rate-limit binding.
- In-flow fallback on very small/occupied viewports can require scrolling to see the reminder. It deliberately preserves clear booking controls.
- No availability or original-fare guarantee: current pricing and availability apply on return.

## Files

Core changes: `shared/save-quote-settings.ts`, `shared/saved-quote.ts`, `shared/saved-quote-emails.ts`; `SaveQuoteReminder`, `SaveQuoteModal`, `OwnerSaveQuoteSettings`, `OwnerShortNoticePanel`, `QuoteCard`; saved quote page/client, saving/payload/sharing APIs, owner settings API and privacy content; Worker saved quote handlers/store, booking settings/owner handlers and router; synchronized Worker shared copies; integration/browser tests and CI workflow. See the PR Files Changed tab for the exact list.

## Screenshots

Fictional journeys and mocked example fares; these are not live price quotes.

| Width | Reminder | Save options | WhatsApp sharing |
|---|---|---|---|
| 320px | [View](320-reminder.png) | [View](320-save-options.png) | [View](320-whatsapp.png) |
| 360px | [View](360-reminder.png) | [View](360-save-options.png) | [View](360-whatsapp.png) |
| 375px | [View](375-reminder.png) | [View](375-save-options.png) | [View](375-whatsapp.png) |
| 390px | [View](390-reminder.png) | [View](390-save-options.png) | [View](390-whatsapp.png) |
| 1440px | [View](1440-reminder.png) | [View](1440-save-options.png) | [View](1440-whatsapp.png) |

Browser coverage includes 20-second inactivity, interaction resets, dismissal, once-per-session/reload suppression, booking suppression, restored return dates/party/vehicle, changed fare, email success and both sharing URL variants. Requests for payments/bookings are intercepted and asserted absent. Actual Safari and real WhatsApp/email delivery remain acceptance checks.
