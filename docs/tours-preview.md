# Private Tours preview environment (WP-B0)

An isolated, private, test-mode copy of the site for Private Tours work. It runs only for pushes to `tours/**` branches (and manual runs). It deploys to the separate **My Airport Taxi NI Staging** Cloudflare account and never to production.

## What it is

| Part | Value |
|---|---|
| Workflow | `.github/workflows/deploy-tours-preview.yml` |
| Triggers | push to `tours/**`, manual run. Nothing else (no pull_request, no `main`, no `cursor/*`) |
| Cloudflare account | staging, `ecad568dc411e28a3e435ef40b36c2b5` |
| Worker | `reimagined-octo-meme-tours-preview` (own Durable Objects, own SQLite storage) |
| KV | `matni-tours-preview-tracking`, `matni-tours-preview-booking-counter` (created in staging) |
| Website | Cloudflare Pages project `matni-tours-preview`, behind the private-link gate, `noindex`, `robots.txt` disallow |
| Payments | Stripe TEST keys only (the Worker refuses to run with anything else) |
| Email | blocked unless the recipient is the tester inbox. With no tester secret every email is blocked |
| Advertising | no Google Ads tag, no conversions, no analytics keys in the build |

The Worker code is the existing preview entry (`src/preview-entry.ts`): default-deny outbound HTTP, Stripe test mode only, CORS limited to the preview site. WP-B0 changes no Worker code. `PREVIEW_ENVIRONMENT = "bespoke-preview"` is kept because the Worker refuses to start without that exact value; a tours-specific value comes with the tours Worker split (WP-B8).

## Files

- `.github/workflows/deploy-tours-preview.yml`
- `scripts/tours-preview-guard.mjs`: isolation assertions and the staging-only secret allowlist
- `scripts/tours-preview-prepare.mjs`: creates/finds staging KV and Pages, renders the config from `wrangler.bespoke-preview.toml` (not edited)
- `scripts/tours-preview-site.mjs`: builds the site pinned to the preview Worker
- `docs/tours-preview.md`
- It reuses `scripts/bespoke-preview-gate.js` unchanged (same private-link access code as the bespoke preview).

## Isolation checks (all fail the run before or during deploy)

1. Guard self-test: proves the guard rejects the production account id, a production KV id, a live Stripe key, a production route, a shared Durable Object, and workflows that use a production secret, `secrets: inherit`, a reusable workflow or `toJSON(secrets)`.
2. Workflow static check: only the allowlisted staging secrets may be referenced, only `actions/checkout@v4` and `actions/setup-node@v4` may be used, `contents: read`, checkout without persisted credentials.
3. Token probe: with the staging token, reads of production Workers, KV and Pages must be refused, and the token must not see any account other than staging.
4. Config check on the rendered Worker config, immediately before deploy.
5. Deployed-bindings check: the live preview Worker may only have the two preview KV namespaces and its own Durable Objects.
6. After deploy: the live website origin must not be accepted by the preview Worker (CORS), the preview site must answer 401 without the private link and carry `X-Robots-Tag: noindex`.

Run the guard offline at any time: `node scripts/tours-preview-guard.mjs --self-test`.

## Secrets

Allowlist (see `ALLOWED_SECRETS` in the guard): `STAGING_CLOUDFLARE_API_TOKEN`, `STAGING_STRIPE_SECRET_KEY`, `STAGING_STRIPE_PUBLISHABLE_KEY`, `STAGING_STRIPE_WEBHOOK_SECRET`, optional `TOURS_PREVIEW_TESTER_EMAIL`, `TOURS_PREVIEW_OWNER_KEY`, `TOURS_PREVIEW_RESEND_API_KEY`, and `GITHUB_TOKEN`.

The Stripe keys are read only by the small `stripe-sandbox` job, which runs in the existing GitHub `staging` environment.

### Remaining credential isolation risks

1. **GitHub cannot stop a workflow reading repository secrets.** Production secrets (live Stripe, production Cloudflare, Resend, Google Ads, WhatsApp) exist as repository-level secrets and any workflow on any branch could name them. The allowlist check blocks this for the tours workflow, but the check lives in the same file it checks. Real fixes are owner actions in GitHub: (a) move production secrets into a protected `production` environment restricted to `main`, and (b) restrict the `staging` environment to branches `tours/**` with `main`. WP-B0 did not move, rotate or modify any secret.
2. **`STAGING_CLOUDFLARE_API_TOKEN` also exists at repository level**, so the main job can use it without environment approval. The in-run token probe proves it cannot read production; the token's permissions should also be confirmed in the Cloudflare dashboard (account scope: staging only).
3. **Pull-request workflows** in this repository run on any PR and can read repository secrets for same-repo branches. Draft PRs into `tours/integration` therefore trigger them. They are read-only checks today; they are outside WP-B0.
4. **Shared access code**: the preview site gate is the one used by the bespoke preview, so one private link opens both.
5. A static check cannot see secrets used by a *different* workflow file added later. WP-A1b (second-tier protection) and the tours branch guard cover edits to workflow files.

## Running costs (estimate)

Staging Workers/KV/Durable Objects/Pages free tier or a few pence a month at test volumes; one Cloudflare cron every 5 minutes; GitHub Actions minutes: roughly 6 to 10 minutes per `tours/**` push (public repository, so standard runners are free).

## Rollback

1. Disable the workflow in GitHub (Actions, Deploy Tours Preview, Disable).
2. Delete the staging resources: Worker `reimagined-octo-meme-tours-preview`, Pages project `matni-tours-preview`, KV namespaces `matni-tours-preview-tracking` and `matni-tours-preview-booking-counter`.
3. Revert the WP-B0 pull request. Production is untouched throughout.
