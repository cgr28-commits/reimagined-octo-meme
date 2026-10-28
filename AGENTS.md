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
