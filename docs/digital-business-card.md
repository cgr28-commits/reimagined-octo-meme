# Digital business card — `/card`

Live address (after approval and deploy): **https://www.myairporttaxini.co.uk/card**

## What's on the page

| Button | What it does |
| --- | --- |
| Get an Instant Quote | Opens the existing live quote tool on the homepage (`/#quote`). No separate booking system. |
| Call Us — 028 9602 2952 | `tel:+442896022952` (the business landline). |
| WhatsApp Us | Existing verified business WhatsApp integration (`whatsAppChatUrl()` in `src/lib/contact-card.ts`). Shows **@belfasttaxi**; the number is never displayed. |
| Save to Contacts | `public/my-airport-taxi-ni-card.vcf` — business name, landline, email, digital card URL, website, logo. |
| Share via WhatsApp | `https://wa.me/?text=…` with the agreed message. WhatsApp opens its chat picker; nothing is sent until the customer taps Send. Works on phones and WhatsApp Web/Desktop. |
| Share Digital Card | The phone's own share sheet (Messages, email, AirDrop…). Where that isn't available (most desktop browsers) the link is copied and a "Card link copied" note shows. |
| Show QR code | Sheet with the QR, plus PNG and SVG downloads. On desktop the QR is shown beside the card ("Scan to open on your phone"). |
| Add to Home Screen | Step-by-step guide for iPhone Safari and Android Chrome (both need the customer to confirm — no one-tap install is promised). Hidden when the card is already opened from the home screen. |

The page keeps its own navy design on every screen size. The Design 3 switch in `src/app/layout.tsx` skips `/card` only; every link off the card is a full page load, so the homepage and quote tool still open in Design 3. The floating WhatsApp/quote widgets are hidden on `/card` (`shouldHidePublicSalesWidgets`) because the card has its own buttons.

## Files

- `src/app/card/page.tsx` — metadata: title, description, canonical `/card/`, Open Graph + Twitter preview, home-screen label
- `src/app/card/DigitalCardClient.tsx` — the card
- `src/lib/digital-card.ts` — card URL, share message, vCard link, analytics helper
- `scripts/generate-digital-card-assets.mjs` (`npm run generate:card-assets`) — rebuilds the vCard and QR codes
- `public/my-airport-taxi-ni-card.vcf`, `public/card-qr.png`, `public/card-qr.svg`, `public/og-card.png`
- `design/digital-card/og-card.html` — source for the 1200×630 link preview image

## Save to Contacts (vCard)

vCard 3.0 (the version iPhone and Android both import most reliably), saved under the business name
(`X-ABShowAs:COMPANY`), with:

- Business Line: +44 28 9602 2952 (the WhatsApp mobile is deliberately **not** included — the landline is the only number customers call)
- Email: bookings@myairporttaxini.co.uk
- Digital card: https://www.myairporttaxini.co.uk/card (first web link, labelled "Digital card" on iPhone)
- Website: https://www.myairporttaxini.co.uk
- Note: airports served, card link and WhatsApp @belfasttaxi
- Logo: the same branded photo as the existing `/contact` vCard

Behaviour: iPhone opens the file straight into "Create New Contact"; Android Chrome downloads it and
opening the download imports it into Contacts; desktop downloads `My-Airport-Taxi-NI.vcf`.
The existing `/contact` page and its vCard are unchanged.

## Analytics

Events go through the site's existing Google tag and **only** after the visitor accepts cookies in the
existing banner (Consent Mode stays as it is). No customer details are sent and no new tracking service
is added.

`digital_card_view`, `digital_card_quote_click`, `digital_card_call_click`, `digital_card_whatsapp_click`,
`digital_card_contact_download`, `digital_card_share` (`share_method`: `whatsapp` / `native` / `copy_link`),
`digital_card_qr_open`, `digital_card_home_screen_help`. Call and WhatsApp taps also count towards the
existing Google Ads contact-click conversions, as on the rest of the site.

## QR code

`public/card-qr.png` (1024×1024) and `public/card-qr.svg` encode exactly `https://www.myairporttaxini.co.uk/card`
— navy on white, error correction level Q (survives scuffs), standard 4-module quiet zone. Decoded and checked
at full size, at 120 px, from the SVG and from on-screen renders.

Print guidance: keep it at least **2 cm wide** on business cards and **4–5 cm** on vehicle stickers, keep the
white border around it, and don't print it on a dark or patterned background. Use the SVG for print shops.

## NFC business cards — how to write the URL

Any standard NFC tag/card works (NTAG213, NTAG215 or NTAG216). No special provider or subscription is needed:
the card just stores a web link, and phones open it in the browser.

1. Install a free NFC writer app — **NFC Tools** (iPhone and Android) is the common one.
2. Open the app → **Write** → **Add a record** → **URL / URI**.
3. Enter `https://www.myairporttaxini.co.uk/card` (the app may split it into `https://` + the rest — that's fine).
4. Tap **Write**, then hold the top of the iPhone (or the middle of the back of an Android phone) on the card until it confirms.
5. Test it: lock and unlock a phone, hold it to the card, and tap the notification — it should open the card.
6. Optional, once you're happy: **Other → Lock tag** in NFC Tools stops anyone rewriting it. Locking is **permanent**, so only do it after testing.

Notes: iPhones read NFC cards with the screen on and unlocked (iPhone XS and newer read them without opening an app);
Android phones need NFC switched on in Settings. Put a small printed QR on the same card for phones without NFC.

## Apple Wallet and Google Wallet — investigation (not implemented)

| | Apple Wallet | Google Wallet |
| --- | --- | --- |
| Feasible? | Yes — a "generic" or "store card" pass with the logo, landline and a QR code to `/card` | Yes — a "Generic" pass with the same content |
| Issuer / signing | Apple Developer Program membership; a Pass Type ID and its signing certificate; each `.pkpass` file is signed (could be one static signed file for everyone) | Google Wallet issuer account (Google Pay & Wallet Console) and a Google Cloud service account; "Add to Google Wallet" links are signed JWTs (could be generated once, or by the existing Cloudflare Worker) |
| Cost | Apple Developer Program: **£79 a year** (UK) | Free |
| Link back to the card? | Yes — tappable links on the back of the pass, plus the QR | Yes — a links module on the pass, plus the QR |
| Approval | None for the pass itself | Google reviews the issuer account before passes can go public |

Honest view: for a business card the benefit is modest — a saved contact and a home-screen shortcut already keep
you one tap away, and many customers never open Wallet for non-ticket passes. Where Wallet passes earn their keep is
**per booking** (pickup time, reference, driver details, updated automatically). If you want Wallet, Google is free
to try first; Apple needs the £79/year membership. Nothing has been registered or paid for.

## Booking confirmations — proposal for approval (nothing changed)

The WhatsApp booking confirmation is the Meta-approved template `mat_booking_confirmed` / `mat_booking_confirmed_v2`
(`workers/addresses/src/whatsapp-templates.ts`, sent from `finalize-paid-checkout.ts`). It has not been touched,
nothing has been submitted to Meta, and timing/delivery logic is unchanged.

**Option A (recommended): add a link button to a new version of the confirmation template.**
A new template (e.g. `mat_booking_confirmed_v3`) with the same body plus the line you asked for:

> Save our digital business card for your next journey:
> https://www.myairporttaxini.co.uk/card

shown as a URL button "Save our card" (buttons are cleaner than a bare link and don't need a variable).
The code would send v3 only once Meta has approved it, falling back to the current template until then — the same
pattern already used for the branded `_v2` templates. It rides on the confirmation the customer already gets, so
there is no extra or unsolicited message.

Risk to weigh: confirmations are **Utility** templates. Meta can re-classify a template as **Marketing** if it thinks
part of it is promotional; Marketing messages cost more per message and should only go to customers who opted in to
marketing. "Save our contact details" is about the booking relationship, so it should stay Utility, but Meta decides.
If it comes back as Marketing, we'd keep the current template.

**Option B (no Meta involvement): add the line to the booking confirmation email only.** Zero risk to WhatsApp
delivery or cost.

**Option C: a link in the existing Google review request** (sent after the journey) — natural place for "for your next journey".

Say which option (if any) and I'll build it on a separate branch for your approval before anything is submitted to Meta.

## Testing done

- Static export build passes; `/card` builds as a static page (7 kB)
- Screenshots: iPhone 14, Pixel 7, desktop 1440×900
- All button destinations checked (quote → `/#quote` loads the homepage quote tool in Design 3; `tel:`; WhatsApp chat; WhatsApp share message decoded and matches the agreed wording exactly; vCard; QR downloads)
- Share Digital Card fallback copies `https://www.myairporttaxini.co.uk/card` and shows the toast
- QR decodes to the exact URL (PNG, SVG, small sizes, on screen)
- vCard parses cleanly (name, company, landline, both URLs, note, 67 KB logo)
- Analytics: `digital_card_*` events only with cookie consent accepted; none when rejected
- Accessibility: axe-core WCAG 2 A/AA — no violations on phone or desktop; dialogs close with Escape and return focus; reduced-motion respected
- No horizontal scroll on phone or desktop

## Still to verify after deploy (can't be done before the page is live)

- WhatsApp link preview: WhatsApp fetches `og:image` from the live domain, so the preview can only be confirmed once `/card` and `og-card.png` are on www.myairporttaxini.co.uk. Check by sending the link in a WhatsApp chat (or Facebook's Sharing Debugger).
- Contact import on a real iPhone and a real Android phone (the files are standard; these are device app behaviours).
