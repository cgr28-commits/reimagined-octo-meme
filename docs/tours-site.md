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
