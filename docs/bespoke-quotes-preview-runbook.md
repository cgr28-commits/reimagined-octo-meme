# Bespoke quotes: isolated preview runbook (Phase 4A → 4B)

Status: **nothing created, nothing deployed.** This session has no Cloudflare credentials (`wrangler whoami` → not authenticated), so every Cloudflare step below is an owner action, or needs a narrowly scoped token from you.

Never paste keys into chat, commits or shell history. `wrangler secret put` prompts for the value.

## Identifiers (non-secret)

| Item | Value |
|---|---|
| Cloudflare account | `36c5c88df4c1f0259413d555f2679f3c` (existing) |
| Preview Worker (to create) | `reimagined-octo-meme-bespoke-preview` |
| Preview Worker URL | `https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev` |
| KV (to create) | `BESPOKE_PREVIEW_TRACKING_STORE`, `BESPOKE_PREVIEW_BOOKING_COUNTER` (ids are filled in after creation) |
| Durable Objects | Owned by the preview Worker; created by its own `preview-v1` migration at first deploy (Phase 4B) |
| Preview website (to create) | Cloudflare Pages project `matni-bespoke-preview` → `https://matni-bespoke-preview.pages.dev` |
| Allowed browser origin | exactly `https://matni-bespoke-preview.pages.dev` (enforced in `src/preview-entry.ts`; production CORS unchanged) |

**Do not reuse** the existing Pages project `my-airport-taxi-ni-preview` or `[env.preview]`. That preview Worker uses **production KV**.

## Owner check before anything else

`wrangler.toml` mentions Cloudflare **Git builds**. In the Cloudflare dashboard:
- Go to Workers & Pages → `reimagined-octo-meme` → Settings → **Builds**.
- Confirm the production branch is `main`.
- Check whether **non-production branch builds** are enabled.
- If they are, pushes to `claude/serene-hamilton-4c65sj` may upload preview *versions* of the production Worker.

I cannot see this from here. Uploaded versions are not deployed, but please confirm nothing from this branch was deployed.

## Phase 4A owner actions (no deploy)

**A1. KV namespaces.** From `workers/addresses`, after `npx wrangler login` with your account:

```bash
npx wrangler kv namespace create BESPOKE_PREVIEW_TRACKING_STORE --config wrangler.bespoke-preview.toml
npx wrangler kv namespace create BESPOKE_PREVIEW_BOOKING_COUNTER --config wrangler.bespoke-preview.toml
```

Paste the two printed ids into `wrangler.bespoke-preview.toml`, replacing the `REPLACE_WITH_BESPOKE_PREVIEW_*` placeholders. Then run `npm run check:bespoke-preview`; it fails if a production id appears.

Alternatively, I can run these myself if you provide a Cloudflare API token through the session's secure credential form. Scope it to this account only, with **Workers KV Storage: Edit**. Add **Workers Scripts: Edit** and **Cloudflare Pages: Edit** only for Phase 4B.

**A2. Preview website host (not public).**
1. Create the Pages project: `npx wrangler pages project create matni-bespoke-preview --production-branch=preview`.
2. Restrict it to you with Cloudflare **Access** (free for up to 50 users):
   - Zero Trust → Access → Applications → Add → Self-hosted.
   - Domains: `matni-bespoke-preview.pages.dev` and `*.matni-bespoke-preview.pages.dev`.
   - Policy: Allow, emails = your tester address(es).
3. If Cloudflare gives a different host (name taken), change `PREVIEW_SITE_ORIGIN`, `SITE_ORIGIN` and `TURNSTILE_ALLOWED_HOSTNAMES` together in the preview config.

**A3. Tester inboxes.** Choose 1–3 addresses you control (not `bookings@`, not customers). Replace every `REPLACE_WITH_TESTER_EMAIL` in the preview config:
- `PREVIEW_EMAIL_ALLOWLIST`
- `BESPOKE_EMAIL_ALLOWLIST`
- `STRIPE_TEST_EMAILS`
- `BOOKING_TO_EMAIL`
- `BOOKING_NOTIFICATION_EMAIL`
- `OWNER_EMAIL_COPY_ADDRESS`

Every outgoing email from the preview is blocked unless **all** of its recipients are on that list.

**A4. Stripe (TEST mode only).** In the Stripe Dashboard, switch on **Test mode**, then:
1. Developers → API keys: you will need the **publishable** key (`pk_test_…`) and **secret** key (`sk_test_…`). A restricted `rk_test_…` key also works; it needs Checkout Sessions read/write and PaymentIntents read.
2. Developers → Webhooks → Add endpoint:
   - URL: `https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev/payments/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - Reveal the **signing secret** (`whsec_…`, test endpoint).
3. Never use live keys. The preview refuses to run with them and blocks Stripe calls without a test key. There is no SumUp fallback (no SumUp keys; `api.sumup.com` blocked).

**A5. Test Google Calendar (optional but recommended).**
1. Create a **new** calendar, e.g. "MATNI preview tests". Never the production calendar.
2. Create a **new** Google Cloud service account just for the preview, and download its JSON key. Do not reuse the production service account: with the production one, a wrong calendar id could reach the live calendar.
3. Share only the test calendar with that service account ("Make changes to events").
4. Note the calendar id (Calendar settings → Integrate calendar).

Duplicate safety is already proven offline (`npm run check:bespoke-isolation`):
- crash right after creation (response lost)
- a race between two attempts
- a network error, a 5xx, and repeated retries

Each ends with exactly one event per leg. The preview test repeats this against real Google.

**A6. Optional Resend key.** If you want real test emails: create a separate Resend API key with *Sending access* only. Without one, preview emails show "failed", which is fine for testing.

## Phase 4B (needs your approval — do not run yet)

From `workers/addresses`:

```bash
# Secrets (each prompts for the value; nothing echoed)
npx wrangler secret put STRIPE_SECRET_KEY        --config wrangler.bespoke-preview.toml   # sk_test_… / rk_test_…
npx wrangler secret put STRIPE_PUBLISHABLE_KEY   --config wrangler.bespoke-preview.toml   # pk_test_…
npx wrangler secret put STRIPE_WEBHOOK_SECRET    --config wrangler.bespoke-preview.toml   # whsec_… (test endpoint)
npx wrangler secret put TURNSTILE_SECRET_KEY     --config wrangler.bespoke-preview.toml   # 1x0000000000000000000000000000000AA
npx wrangler secret put OWNER_ACCESS_KEY         --config wrangler.bespoke-preview.toml   # NEW preview-only key
# optional
npx wrangler secret put RESEND_API_KEY                        --config wrangler.bespoke-preview.toml
npx wrangler secret put GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON  --config wrangler.bespoke-preview.toml
npx wrangler secret put GOOGLE_CALENDAR_ID                    --config wrangler.bespoke-preview.toml
npx wrangler secret put GOOGLE_PLACES_API_KEY                 --config wrangler.bespoke-preview.toml

# Checks, then deploy (creates the preview Worker + applies ONLY its own preview-v1 migration)
npm --prefix .. run check:bespoke-preview
npm run build
npx wrangler deploy --dry-run --config wrangler.bespoke-preview.toml
npx wrangler deploy --config wrangler.bespoke-preview.toml
```

Preview website build and deploy, from the repo root:

```bash
rm -rf .next
GITHUB_PAGES=true \
NEXT_PUBLIC_BOOKINGS_API_URL=https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev/bookings \
NEXT_PUBLIC_ADDRESSES_API_URL=https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev/addresses \
npm run build
npx wrangler pages deploy out --project-name=matni-bespoke-preview --branch=preview
git checkout -- public/sitemap.xml   # the build regenerates it; never commit that change
```

The GitHub Pages workflow and the production Worker workflow are never involved.

### Phase 4B validation list

1. **Startup refusal:** with `STRIPE_SECRET_KEY` temporarily a live-format value, every request → 503. Then restore the test key.
2. **CORS:** a request from `https://www.myairporttaxini.co.uk` gets no `Access-Control-Allow-Origin`.
3. **Create a request.** There is no public form until Phase 5, so:
   ```bash
   curl -X POST https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev/bespoke-quotes/request \
     -H 'Content-Type: application/json' -H 'Origin: https://matni-bespoke-preview.pages.dev' \
     -d '{ …request fields…, "turnstileToken":"XXXX.DUMMY.TOKEN.XXXX", "customerEmail":"<tester>" }'
   ```
4. **Owner dashboard** on the preview site (preview owner key):
   - quote
   - send (tester inbox only)
   - resend
   - decline/cancel
5. **Stripe test cards:**
   - success `4242 4242 4242 4242` → CONFIRMED, booking in Jobs/Calendar, one confirmation email
   - decline `4000 0000 0000 0002`
   - 3-D Secure `4000 0025 0000 3155`
6. **Abandon a checkout:** after about 30 minutes, the session is expired and the quote returns to QUOTED (or EXPIRED).
7. **Resend** the `checkout.session.completed` webhook from the Stripe dashboard → nothing changes.
8. **Owner cancel during checkout** → session expired. Paying just before → payment-after-cancellation review.
9. **Accept a reviewed payment** → booking created, then CONFIRMED.
10. **Calendar (if configured):** exactly one event per leg; "Retry calendar" creates no duplicate.
11. Check Worker logs for `[preview] blocked outbound call` lines. Expected for disabled integrations; never a real recipient.
12. **Go/no-go**, then keep or delete: `npx wrangler delete --config wrangler.bespoke-preview.toml`, `wrangler kv namespace delete …`, and the Pages project.
