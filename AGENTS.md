# AGENTS.md

## Hosting guardrails (read first — applies to every agent)
The live site is served by **GitHub Pages from this repo on a free GitHub plan**. On 28 Oct 2026
the site went down twice because of hosting changes. Never do, suggest or instruct any of these:

- **Do not make this repository private.** Free-plan GitHub Pages only works on public repos;
  going private unpublishes the site immediately. Keep secrets out of the repo instead (Cloudflare
  Worker secrets / GitHub Actions secrets) and rotate anything that was ever committed.
- **Do not change Settings → Pages → Source.** It must stay **GitHub Actions**
  (`deploy-pages.yml`). "Deploy from a branch" publishes the raw repo (README) as the homepage.
- **Do not delete or rename `CNAME` / `public/CNAME`** (`www.myairporttaxini.co.uk`).
- `site-watchdog.yml` checks the live site every 15 minutes, redeploys if it is broken and emails
  the owner. Do not disable it.

## SEO stability freeze (owner decision, 26 Nov 2026)
The SEO stability period began on **26 November 2026**. It stays active until the owner explicitly
authorises its removal after the SEO review on 7 January 2027.
- **7 January 2027 is a review checkpoint, not an expiry date.** Do not treat the freeze as lifted
  on or after that date unless the owner has said so.
- During the stability period, every coding agent works in **read-only SEO monitoring and
  recommendation mode**. That means no changes to SEO titles, meta descriptions, H1s, internal
  linking, structured data or landing pages, and no SEO branches, commits, PRs, merges or deploys.
  The only exception is a specific change the owner explicitly approves.
- SEO changes that were approved earlier but never merged (for example older `seo/*` branches) must
  not go ahead without fresh owner approval.

Why: Search Console showed the Belfast International page losing ground after its title was
rewritten five times in three weeks (29 Oct–20 Nov 2026). Frequent title churn stops Google
settling on a page. The pages below are the ones the Phase 2 SEO change (PR #1072) set.

| Page | Frozen title | Frozen H1 | Source |
| --- | --- | --- | --- |
| Homepage `/` | Airport Taxi Belfast, NI & Ireland \| My Airport Taxi NI | Belfast & Dublin Airport Transfers | `HOMEPAGE_SEO_TITLE` in `src/lib/data.ts`; H1 in `src/components/HeroSlideshow.tsx` |
| `/airports/belfast-international/` | Belfast International Airport Taxi (BFS) \| Fixed Fares | Belfast International Airport Taxi & Transfers | `src/lib/location-pages.ts` |
| `/airports/belfast-city/` | Belfast City Airport Taxi (George Best BHD) \| Fixed Fares | Belfast City Airport Taxi & Transfers | `src/lib/location-pages.ts` |
| `/belfast-grand-central-station-taxi/` | Belfast Grand Central Station Taxi \| Pre-Booked, Fixed Fare | Belfast Grand Central Station Taxi Transfers | `src/app/belfast-grand-central-station-taxi/page.tsx` |
| `/locations/lisburn-airport-taxis/`, `/locations/newry-airport-taxis/`, `/locations/craigavon-airport-taxis/`, `/locations/coleraine-airport-taxis/` | as live on 26 Nov 2026 | as live on 26 Nov 2026 | `src/lib/town-hubs-*.ts` |

- Page targeting: the Belfast International page targets "Belfast International Airport /
  Aldergrove / BFS" taxi and transfer searches. The homepage keeps the generic "Belfast airport
  taxi" searches. Do not put "Belfast Airport Taxi" at the start of the BFS title.
- Internal links: keep useful airport links from every relevant town page, with natural anchor text
  that fits the sentence. Don't add a second contextual link to the same airport in the same block.
  Don't randomise anchors or set keyword ratios.
- Don't make further SEO changes because of short-term ranking moves. Present the Search Console
  evidence and get owner approval first.
- Snippet claims must match the real service: say "book online 24/7", never 24/7 drivers. The 5% return
  discount applies to the journey fare. The 100% refund needs cancellation 24+ hours before pickup.

## Visual quality (standing acceptance requirement)
Every feature must be **functionally correct, visually balanced, mobile-first, consistent with
premium branding, and professionally presented**. Typography, line breaks, spacing, alignment and
readability must be deliberately reviewed. Passing technical tests alone does **not** constitute
completion.

- Inspect the **rendered** UI (not only DOM/CSS dumps). Capture mobile screenshots where the work
  is visual, then look at those images for awkward wrapping, orphans, poor contrast, clipped text,
  uneven spacing, misaligned icons/buttons, or unbalanced headings — and fix what you find.
- Prefer responsive sizing, `max-width`, line-height and `text-wrap: balance` / intentional structure
  over brittle hardcoded `<br>` that break at other widths. On very narrow screens, graceful wrap is
  fine; never clip or force horizontal scroll for copy.
- Brand palette: deep navy `#071C38`, emerald `#2FBF4A`, white / readable neutrals on dark surfaces.
  Cormorant for display headings; clean sans for supporting copy. Keep effects restrained.
- Watch Safari/WebKit specifically for `-webkit-text-fill-color` inheritance (a fill set on a dark
  parent can make navy labels invisible on white buttons even when `color` is correct).
- If Safari on a real iPhone cannot be tested in the environment, say so — do not claim Safari
  verification from Chromium-only tooling.
- Scope visual refactors to the surfaces in the request; do not make broad site-wide CSS changes
  without identifying their effects.

## Cursor Cloud specific instructions

### What this repo is
`My Airport Taxi NI` — a Next.js 15 / React 19 marketing + booking site for a Northern Ireland
airport-transfer taxi service. It is a **static-export** site (deployed to GitHub Pages) with an
optional **Cloudflare Worker** backend under `workers/addresses` (address lookup, bookings, quotes,
tracking, etc.). Shared worker logic lives in `shared/` and is synced into the worker at build time.

Dependencies are installed by the startup update script (`npm install` for the root app and for
`workers/addresses`). No secrets are required for local development: when
`NEXT_PUBLIC_ADDRESSES_API_URL` / `NEXT_PUBLIC_BOOKINGS_API_URL` are unset, the frontend calls the
live production Worker, so the whole site renders and the quote/booking flow works out of the box.

### Running the frontend
`npm run dev` works — it serves the site with hot reload at http://localhost:3000. Use this for
day-to-day development.

Historical note: an earlier revision had a circular import between `src/lib/data.ts` and
`src/lib/paths.ts` that made `npm run dev` 500 on every page with
`ReferenceError: Cannot access 'BASE_PATH' before initialization`. That is **fixed** on `main`:
`paths.ts` no longer imports from `data.ts` (it uses a local `CANONICAL_SITE_ORIGIN` constant), so
it is a leaf module and the cycle is gone.

Cache gotcha: do **not** run `GITHUB_PAGES=true npm run build` and `npm run dev` against the same
`.next` directory. The production export and the dev server share `.next`, and mixing them causes
transient `Cannot find module './####.js'` chunk 404s in dev (not a code bug). If you hit that, run
`rm -rf .next` and then `npm run dev`.

The site also builds as a static export (how it deploys to GitHub Pages), which you can serve for a
production-like check:

```bash
GITHUB_PAGES=true npm run build   # static export -> ./out
npx serve out -l 3000             # optional: serve the exported site
```

### Cloudflare Worker (optional for most UI work)
The frontend defaults to the deployed production Worker, so you only need the Worker locally to test
bookings/addresses/tracking against your own backend.

- Run locally: `npm run dev:addresses` (wrangler dev on port 8787; uses `wrangler.local.toml` demo config).
- To point the frontend at the local worker, set `NEXT_PUBLIC_ADDRESSES_API_URL=http://localhost:8787/addresses`
  and `NEXT_PUBLIC_BOOKINGS_API_URL=http://localhost:8787/bookings` at build time.

### Lint / typecheck / build commands
- Frontend lint: `npm run lint` (warnings only; exits 0).
- Frontend build (static export): `GITHUB_PAGES=true npm run build`.
- Worker typecheck + dry-run deploy: `npm --prefix workers/addresses run build` (runs `tsc --noEmit`
  then `wrangler deploy --dry-run`; it also syncs `shared/` into the worker).

### Notes
- Node 22 is present and works; CI pins Node 20. Both build the export successfully.
- The `SITE_OFFLINE` flag in `src/lib/data.ts` gates the whole public site behind a holding page when
  `enabled: true`. It is currently `false` (full site shows). If a future run sees only a holding
  page, check that flag.

### Fonio phone receptionist (natural business name)
When changing Fonio prompt copy, spoken `say` strings, or related docs
(`docs/fonio-receptionist-prompt.md`, `docs/fonio-tool-config.md`, `/voice/*`):

- Use the business name **once** in the opening greeting only, spoken as **My Airport Taxi**
  (e.g. “Good morning, My Airport Taxi. How can we help?”). Never say “NI” out loud — callers
  hear it as “AI” (owner decision, 15 Nov 2026). Written SMS/WhatsApp/email keep “My Airport Taxi NI”.
- After the greeting, speak as **we / us / our**. Do not repeat the full name when asking
  questions, quoting, confirming, sending links or ending calls.
- Only repeat the full name if the caller asks who they are speaking to, or clarification is
  genuinely needed.
- Avoid robotic closings such as “Thank you for choosing My Airport Taxi NI”.
- Prefer short warm phrases (“No problem at all”, “Certainly”, “That’s grand”, “We can check
  that for you”) without overusing them.
- Do **not** ask “Is there anything else I can help you with?” after every answer; offer further
  help only when the topic is finished or the caller seems unsure.
- Never introduce as an AI unless asked directly (then answer truthfully).
- SMS/WhatsApp bodies may still prefix **My Airport Taxi NI:** so the sender is clear in text —
  that does not apply to spoken phone turns.
- Phone booking links use the existing website `/book-quote` → Stripe Checkout path. Never collect
  card details on the call; never say paid until backend Stripe verification updates the booking.
  Do not rebuild payment code for Fonio — reuse the working Stripe integration.
- Never promise a driver has been assigned because Stripe payment succeeded — confirm only booking
  status verified by Booking Lookup; driver details follow closer to pickup.
- Distinguish SMS/WhatsApp link statuses accurately: `generated` (prepared, not sent), `accepted`
  (accepted for sending — may say “we've sent the link”), `delivered` (handset delivery only when
  the tool returns it). Prefer `sayAfterSmsAccepted` after a successful Fonio SMS send.
- When Get Quote returns `ok=false`, do not quote a fare — follow `askNext` / missing / error fields.
- Inbound greeting is Europe/London local time and must be spoken once only.
- Do **not** deploy or paste changes into the live Fonio assistant without explicit approval.
  Review copies live in `docs/fonio-receptionist-prompt.md`.
- In every Fonio-related reply to the user, end with **one copyable** block: the full current
  receptionist prompt from `docs/fonio-receptionist-prompt.md` inside a single ` ```text ` fence
  (for ChatGPT / Fonio paste). Do not ask them to open the file for the prompt text.
