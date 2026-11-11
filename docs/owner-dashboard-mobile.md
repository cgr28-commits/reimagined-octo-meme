# Mobile-first Owner Dashboard — staging notes

Branch: `claude/owner-dashboard-mobile` (staging only — not merged, not deployed to the live site).
Design reference: the approved canvas "Owner Dashboard — Mobile Redesign" (Nov 2026).

## How to try it

- Isolated staging: `https://matni-dashboard-staging.pages.dev/owner/?ui=mobile`, deployed by
  `deploy-dashboard-staging.yml` to the separate "My Airport Taxi NI Staging" Cloudflare account — its own
  KV, D1 and Durable Objects, no crons, and every outbound request blocked (see docs/dashboard-staging.md).
  Sign in with the **staging** owner key (not the live one).
- Correction (10 Nov 2026): the earlier preview at `claude-owner-dashboard-mobil.my-airport-taxi-ni-preview.pages.dev`
  was **not** isolated — the shared preview Worker uses the live KV store and inherits the live crons. This
  branch no longer deploys there, and the owner key was removed from that preview Worker.
- The staging copy has little or no data. On a preview host, Home offers **Show sample data** — every
  screen then shows a "Sample data" banner and nothing can be sent.
- `?ui=mobile` is remembered on that device; More › "Use the classic dashboard" switches back, and the
  classic More menu has "Try the new mobile dashboard". The classic dashboard is the default.

## What's in this stage

- Bottom bar: Home, Bookings, Inbox (email + WhatsApp), Customers, More — badges for unread messages and
  short-notice requests. Becomes a navy side menu at 1024 px+. Hidden while typing so the keyboard never
  covers it.
- Home: next pickup with countdown, "Needs you now" (short-notice requests, unanswered email/WhatsApp,
  awaiting payment), today's bookings with earned revenue (same rule as Money › Earned).
- Bookings: Today / Tomorrow / Upcoming, search (name, reference, airport, date, flight), booking cards,
  booking detail with Call / WhatsApp / Email / Navigate and copy-address. Status, edits, cancellations and
  refunds open the existing job controls, unchanged.
- Inbox: All / Email / WhatsApp, Unread and Needs-reply filters, email conversation + reply with preview
  before sending, WhatsApp conversation with the 24-hour reply window shown and an "Open in WhatsApp"
  shortcut once it has closed.
- Customers: directory merged by email or mobile (no duplicates), bookings, total paid (only where every
  amount is known), message links.
- More: plain-English groups; Postcode Pricing, A2A Quotes, Personal Quotes, Same Fare Test and Empty Legs
  moved under "Advanced & testing tools" (all still working).
- Duplicate-send guard on email replies and WhatsApp replies (`sendId`, server-side, 24 h).

Unchanged: fares, surcharges, deposits, refunds, payment flows and booking rules. Pricing, refunds and job
status still use the existing screens.

## Owner key out of web addresses (migration)

1. ✅ Dashboard and driver pages send keys only in `X-Owner-Key` / `X-Driver-Key` / `X-Driver-Session`
   headers (`src/lib/tracking-api.ts`). The inbox's conversation id moved from `?key=` to `?thread=`
   (Worker accepts both for now).
2. ✅ Worker logs `access_key_in_url` (path only, never the key) when a request still relies on `?key=`.
3. After release, watch the Worker logs for two weeks.
4. When nothing logs it, set `urlKeyFallbackDisabled = true` in `workers/addresses/src/driver-auth.ts`.
5. Then rotate the owner key (`npm run set:owner-key`) — a live change that needs the owner's approval.

Release order when approved: Worker first (it accepts both old and new requests), then the website.

## Still to build (next stages)

- Server-side drafts, Sent/Archive folders in the new inbox, new emails not tied to a reply, attachment
  viewing via short-lived links, delivery-failure alerts (Resend events), branded templates.
- Customer notes stored on the server.
- Driver Dispatch & Payments (Stripe Connect, test mode only) — designs approved; not started.

## Checks

- `npx tsx scripts/check-owner-mobile-data.ts`
- `npx tsx scripts/check-owner-inbox.ts` (includes the duplicate-send guard and `?thread=`)
