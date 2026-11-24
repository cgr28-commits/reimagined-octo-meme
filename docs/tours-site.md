# Private Tours website (staging preview)

Staging only. Built into `tours/integration`; never merged to `main`, never deployed to production.

## What is here
- `/private-tours/` hub, six signature tours (`/private-tours/<slug>/`), attraction library, Smart Itinerary Builder (`/plan/`), cruise page, owner enquiries view (`/owner/`).
- The live `/tours` pages are untouched.
- Editorial Ivory design, CSS scoped under `.pt` (`src/app/private-tours/private-tours.css`).

## Engine (`workers/tours/src/engine`)
Plain ESM shared by the browser (instant fit checks) and the Worker (authoritative re-check of every enquiry from stop ids; client timings are never trusted).
- Provisional journey estimates: straight line x 1.3, tiered speeds, 5-minute stop overhead. Traffic and peak uplifts are unconfigured.
- Rules: max 4 guests, 4-hour minimum tour, 11-hour working day, opening hours, closed days, seasons, approved area combinations, cruise buffers (60 / 90 minutes, raise-only) plus the 30-minute traffic contingency.
- The driver routing anchor lives in `workers/tours/src/anchor.js` (server only). The browser engine uses the pick-up point as a neutral anchor, so driver positioning cannot be derived by customers.
- Google routing and automated payments are deliberately not part of this build.

## Worker routes (staging tours Worker)
Public (rate limited, validated, CORS limited to the staging Pages origin): `POST /enquiries`, `POST /itinerary/save`, `GET|DELETE /itinerary/saved/:token`.
Owner key required: `GET /owner/enquiries`, `POST /owner/enquiries/status`, `POST /owner/enquiries/delete`.
Emergency controls decide every enquiry through an internal-only Durable Object route; if controls are unreadable the enquiry goes to manual review (never fails open).

## Privacy
- Enquiries and saved plans are deleted after 30 days (alarm plus purge on every request).
- Saved plans hold stops, times and preferences only: no contact details, mobility needs or free text.
- Mobility preferences are stored only with explicit consent, only inside the owner-only enquiry record, never in a public response or analytics.
- Customers only ever receive a reference and a message. No driver data, working time or owner flags.
- Luggage limits are unset, so any luggage sends the enquiry to owner review.

## Attraction library (photos, search, itinerary)
- Search, filters, expandable details, add/remove with a clear "In your itinerary" state, and a floating My Itinerary button with the count. The selection is a per-visitor convenience in the browser (localStorage) and feeds the planner.
- Photographs: openly licensed (CC0, CC BY, CC BY-SA, public domain) from Wikimedia Commons, fetched and credited by `scripts/tours-attraction-photos.mjs` through the one-off `tours-attraction-photos` workflow. Credits (photographer, licence, source) live in `src/lib/private-tours-photo-credits.json` and show on each card's More info and in the page's credits list. Picks were reviewed by eye; override one with `pick` in `scripts/tours-attraction-photos.config.json`.
- The library never states opening hours, admission prices or accessibility. The engine's hours and walking levels are provisional placeholders used only for fit checks, and every message that depends on them says so; the owner confirms real data later.

## Production launch (enquiry-only), not yet deployed
Nothing here is live until the owner gives final approval. Enquiry-only: no payments, no automated availability, no Google routing; every enquiry is a request for a personal quote that the owner approves by hand.
- Site switch: the Pages build is in staging mode (noindex, banner, no API) unless repository variables `TOURS_LAUNCH=live` and `TOURS_API_URL=<Worker address>` are set. Live mode makes the pages indexable, adds them to the sitemap, links them from `/tours`, and sends enquiries to the production Worker. Unset them to switch back.
- Worker: `workers/tours/wrangler.production.toml` (`reimagined-octo-meme-tours`, production account, own Durable Objects only, live-site origins only). Deployed only by the manual workflow `deploy-tours-production.yml` (type `DEPLOY TOURS WORKER`, environment `tours-production`). Production serves enquiries, saved plans, the owner view and the emergency controls; the settings editor stays staging-only.
- Owner email: one short email per enquiry (reference, date, guests, link) when `RESEND_API_KEY` and `TOURS_NOTIFY_EMAIL` are set. It never contains customer details.
- Privacy: new "Private Tours enquiries" section in the privacy policy; enquiries and saved plans are deleted after 30 days.
