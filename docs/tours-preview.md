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

The Stripe keys are read only by the small `stripe-sandbox` job, which runs in the existing GitHub `staging` environment. That environment currently allows only certain branches: **until the owner adds `tours/**` to the `staging` environment's deployment branches, GitHub rejects this job** ("Branch ... is not allowed to deploy to staging") and the preview runs without Stripe test keys (payments unavailable on the preview). The job is `continue-on-error` so this does not fail the preview deploy.

### Remaining credential isolation risks

1. **GitHub cannot stop a workflow reading repository secrets.** Production secrets (live Stripe, production Cloudflare, Resend, Google Ads, WhatsApp) exist as repository-level secrets and any workflow on any branch could name them. The allowlist check blocks this for the tours workflow, but the check lives in the same file it checks. Real fixes are owner actions in GitHub: (a) move production secrets into a protected `production` environment restricted to `main`, and (b) restrict the `staging` environment to branches `tours/**` with `main`. WP-B0 did not move, rotate or modify any secret.
2. **`STAGING_CLOUDFLARE_API_TOKEN` also exists at repository level**, so the main job can use it without environment approval. The in-run token probe proves it cannot read production; the token's permissions should also be confirmed in the Cloudflare dashboard (account scope: staging only).
3. **Pull-request workflows** in this repository run on any PR and can read repository secrets for same-repo branches. Draft PRs into `tours/integration` therefore trigger them. They are read-only checks today; they are outside WP-B0.
4. **Shared access code**: see "Outstanding isolation concern: shared preview gate" below.
5. A static check cannot see secrets used by a *different* workflow file added later. WP-A1b (second-tier protection) and the tours branch guard cover edits to workflow files.

## Secure owner preview access procedure

1. Open `https://matni-tours-preview.pages.dev/?k=<access code>` once, on your iPhone or laptop. The code is the existing preview access code; only its SHA-256 hash is in the repository, so the code itself is never committed, logged or shown in a run.
2. The gate checks the code, sets a 30-day cookie (`matni_preview`) and removes the code from the address bar. After that, open the plain URL.
3. Without the cookie every page answers 401 "Private preview" with `noindex`. Search engines are also blocked by `robots.txt`.
4. Do not paste the link into email, WhatsApp, tickets or chat. Share it only in person with someone you trust and use a private browser tab on shared devices. To end access, clear the site's cookies.
5. Owner Dashboard on the preview: sign-in needs the secret `TOURS_PREVIEW_OWNER_KEY` (add it as a GitHub secret, minimum 24 characters, never reuse the production owner key). Without it the run generates a random key and the preview dashboard cannot be signed in to.
6. Payments: only Stripe TEST cards work, and only once the Stripe test keys are added (see "Open items"). Never enter a real card.
7. Email: every preview email is blocked unless `TOURS_PREVIEW_TESTER_EMAIL` is set, and then only that address receives anything.

## What the preview application can and cannot reach

The preview Worker holds only these secrets: `OWNER_ACCESS_KEY` (preview-only) and Cloudflare's public Turnstile test secret. The workflow fails if any of these are ever present on it: SumUp, driver access key, 360dialog, WhatsApp, Google Ads developer token, Google Places key, a live Stripe webhook secret. Outbound HTTP from the preview Worker is default-deny, and email, calendar, advertising and WhatsApp are unreachable because no credential for them exists on the preview Worker. The Stripe job refuses any key not starting `sk_test_`, `rk_test_` or `pk_test_`.

## Open items found during WP-B0 verification

1. **Staging environment branch rule not yet applied.** The GitHub `staging` environment allows only two branches (`claude/serene-hamilton-4c65sj` and `payment-staging`). `tours/**` is not among them, so the Stripe test-key job is rejected before it starts. The environment also requires an approving reviewer, so even after the rule is added the job will wait for owner approval on each run.
2. **A Stripe key-like value sits in a plain-text environment *variable*** on `staging` (named `STAGING_STRIPE_SECRET_KEY`, separate from the real secret of the same name). Variables are readable in settings and are not masked. Its type (test or live) could not be determined from the settings page. Owner action: confirm it is a TEST key; if it is a secret key of either mode, delete the variable and rotate that key. WP-B0 did not read it into any workflow and did not change it.
3. Stripe test-mode configuration therefore has **not** been verified end to end.

## Mandatory prerequisite before tours production integration: repository-level production secret isolation

Status: **outstanding, mandatory before WP-B11 (production integration).** Production secrets (live Stripe, production Cloudflare token, Resend, Google Ads, WhatsApp and others) are repository-level GitHub secrets and can be read by any workflow on any branch.

Proposed safe migration plan (nothing below has been done; no production secret has been moved, changed, rotated or deleted):

1. Inventory every workflow that reads each production secret (names only) and note which need them on `main` only.
2. In a quiet period, create a protected `production` environment restricted to `main`, with the owner as required reviewer if acceptable to the owner for the daily jobs, otherwise no reviewer.
3. Add a copy of each secret to the environment through the GitHub settings screen by the owner (values never pass through Claude or the logs).
4. Change production workflows to run their jobs with `environment: production`, one workflow at a time, each through its own PR, verifying one successful run before the next.
5. Only after every consumer has run successfully from the environment, the owner deletes the repository-level copies, one secret at a time, keeping the previous value available to restore.
6. Restrict `staging` to `tours/**` plus its existing branches; verify a tours branch run cannot resolve any production secret.
7. Combine with WP-A1b second-tier protection (required guard check, workflow files protected).
Rollback at each step: restore the repository-level secret and revert that workflow PR.
Daily jobs (`daily-health-check`, `ots-pricing-check`) and `site-watchdog` must be re-verified after step 4.

## Outstanding isolation concern: shared preview gate

The tours preview uses the same private-link gate (`scripts/bespoke-preview-gate.js`) and the same access code hash as the bespoke preview, so one link and one cookie name open both. Anyone holding one link can open the other. Recommended before wider testing: give the tours preview its own access code, hash and cookie name. Not done in WP-B0, which reuses the gate unchanged.

## Running costs (estimate)

Staging Workers/KV/Durable Objects/Pages free tier or a few pence a month at test volumes; one Cloudflare cron every 5 minutes; GitHub Actions minutes: roughly 6 to 10 minutes per `tours/**` push (public repository, so standard runners are free).

## Rollback

1. Disable the workflow in GitHub (Actions, Deploy Tours Preview, Disable).
2. Delete the staging resources: Worker `reimagined-octo-meme-tours-preview`, Pages project `matni-tours-preview`, KV namespaces `matni-tours-preview-tracking` and `matni-tours-preview-booking-counter`.
3. Revert the WP-B0 pull request. Production is untouched throughout.
