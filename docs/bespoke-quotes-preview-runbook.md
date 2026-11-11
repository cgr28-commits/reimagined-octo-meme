# Bespoke quotes: isolated preview runbook (Phase 4A → 4B)

> **Owner set-up steps (simple, numbered): see `docs/bespoke-preview-owner-setup.md`.**
> Cloudflare Access note: "Enable access policy" protects only preview deployments.
> Protecting `matni-bespoke-preview.pages.dev` itself needs Cloudflare's documented
> extra steps (remove the `*` subdomain, then re-enable), which are in the owner guide.

Status: **private preview deployed to the separate Staging Cloudflare account** by
`.github/workflows/deploy-bespoke-preview.yml`. Nothing live is involved. The earlier manual
steps (wrangler login, KV commands, Cloudflare Access) are **no longer needed**; the simple
owner guide is `docs/bespoke-preview-owner-setup.md`.

## Where the preview lives (non-secret)

| Item | Value |
|---|---|
| Cloudflare account | "My Airport Taxi NI Staging" `ecad568dc411e28a3e435ef40b36c2b5` (never the live account) |
| Preview Worker | `reimagined-octo-meme-bespoke-preview` (address shown in the workflow run) |
| KV | `matni-bespoke-preview-tracking`, `matni-bespoke-preview-booking-counter` (created by the workflow) |
| Durable Objects | Owned by the preview Worker; its own `preview-v1` migration. Live migration v6 is untouched. |
| Preview website | Cloudflare Pages project `matni-bespoke-preview`, behind a private link, noindex |
| Allowed browser origin | exactly the preview website (enforced in `src/preview-entry.ts`; live CORS unchanged) |
| Turnstile | Cloudflare's always-pass test keys, accepted only when `PREVIEW_ENVIRONMENT` and `TURNSTILE_TEST_KEYS` are both set (preview config only) |

The committed `wrangler.bespoke-preview.toml` keeps its `REPLACE_WITH_…` placeholders. The workflow
fills them in a temporary copy (`scripts/bespoke-preview-prepare.mjs`), which refuses live ids,
the live account and the live bookings mailbox.

**Do not reuse** the existing Pages project `my-airport-taxi-ni-preview` or `[env.preview]`.

## Manual commands (reference only — the workflow does this)

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
# Guarded build: refuses the production Worker, and checks the built JS points at the preview Worker.
node scripts/build-bespoke-preview-site.mjs
npx wrangler pages deploy out --project-name=matni-bespoke-preview --branch=preview
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
