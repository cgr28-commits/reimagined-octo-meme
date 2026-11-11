# Belfast events hub and public request pages

Status: built on the development branch, **switched off**. Nothing is live.

## Pages
| Page | Path | What it does |
|---|---|---|
| Belfast events hub | `/events/` | Approved upcoming events (concerts, sport, theatre, comedy, festivals, exhibitions), how it works, groups, venues, FAQs |
| Event transfer request | `/events/transfer-request/` (`?event=<id>` pre-fills a listed event) | Request form → existing bespoke backend |
| Bespoke Business Class request | `/business-class-request/` | Request form (max 3 passengers) → existing bespoke backend |

Both forms post to `POST /bespoke-quotes/request` and appear in Owner Dashboard → More → **Event & Business Class**. No price is shown; the owner sends a personal quotation.

## Two switches, both OFF
1. **Website:** pages exist only when built with `NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES=1`. Otherwise they show "Page not found" (noindex), are not in the sitemap and are not linked. Only `scripts/build-bespoke-preview-site.mjs` sets it.
2. **Worker:** `BESPOKE_QUOTES_ENABLED = "1"` (preview config only). Off → `/events/public` and `/bespoke-quotes/*` return 404.

Turnstile: the site key comes from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. With no key, the forms say online requests are unavailable and cannot be sent. The preview uses Cloudflare's public always-pass test key unless `PREVIEW_TURNSTILE_SITE_KEY` is given.

## Event listings (manual approval)
- Owner Dashboard → More → **Belfast events**: add, edit, approve and publish, unpublish, postpone, cancel.
- New events are drafts. Publishing requires the owner to confirm the summary is in their own words. There is no image field, and nothing is imported.
- Belfast only: a listed Belfast venue, or another venue with a BT1–BT17 postcode.
- Storage: Worker KV `TRACKING_STORE`, new prefix `bevt:` only. Edits carry a version, so a second device gets "changed on another device" instead of overwriting.
- Public view (`GET /events/public`, 5-minute cache) never includes drafts, past events, the source note or private notes.
- Hybrid publishing: the hub is built with the approved list (Worker, falling back to `src/data/belfast-events-snapshot.json`) and then refreshes live in the browser, so approvals and cancellations show without a rebuild.
- A request for a listed event takes the event name, venue and date from the approved listing, not from the browser. Postponed or cancelled events refuse requests. Unknown or draft ids are dropped (typed details kept).

## Safeguards
- 7-seater: requests of 5–7 passengers flag a 7-seater request, always "subject to availability". 8+ → call us. No other vehicles are mentioned.
- Business Class request form: 1–3 passengers (shared `BUSINESS_CLASS_MAX_PASSENGERS`), also enforced by the Worker.
- The instant airport quote and the automatically priced Business Class option are untouched (checked in `scripts/check-belfast-events.ts`).
- SEO (when enabled): canonical URLs, breadcrumb, Service and FAQ structured data. No Event rich-result markup, because we provide transport, not tickets.

## Tests
`npm run check:belfast-events` covers the model, the approval gate, the Worker routes, switch-off behaviour, copy and capacity guards. Listed-event request binding is covered in `npm run check:bespoke-quote`.

## Before launch (owner)
- Phase 4B preview (Cloudflare and Stripe test setup) and testing on the preview.
- A real Turnstile widget for the live hostname, with its site key set in the Pages build.
- Add real events in the dashboard.
- Approve: switch both flags on, deploy the Worker (applies migration v6), and decide whether to link the hub from the header or footer.
