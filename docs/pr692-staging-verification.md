# PR #692 isolated staging verification

Status: preparation only. Provider/deployment verification must not be claimed until the staging workflow completes and the test matrix below is exercised.

## Scope and identity

- Release application: `df16c3530c9cdf575237e1ab87303b06807b0f4b`, PR #692.
- Staging tooling branch: `staging/pr692-isolation`. No changes to the PR #692 branch or main.
- Worker target: `reimagined-octo-meme-pr692-staging`, using its own generated Wrangler configuration.
- Two separate KV namespaces, named with the staging Worker prefix, and four separate SQLite Durable Object classes belonging to the staging Worker. Production IDs are rejected; existing namespaces require the correct staging identity before reuse.
- No custom routes, DNS changes, production environment updates, cron triggers or production scheduled handler.
- The existing `env.preview` is deliberately not used: it shares production KV and its workflow copies live payment credentials.
- Automatic Vercel deployment of this tooling branch is disabled in its branch-local configuration, preventing a preview silently falling back to the live Worker. An actual staging frontend must explicitly use the new Worker URLs.

## Credentials required

Configure a GitHub environment named `pr692-staging`, restricted to `staging/pr692-isolation`, with a required reviewer for the exact staging commit. Store these **new, separate** secrets there; do not copy production credentials and do not paste values into chat:

| Secret | Purpose |
|---|---|
| `PR692_STAGING_CLOUDFLARE_API_TOKEN` | Dedicated account-scoped Worker/KV management credential for provisioning staging only |
| `PR692_STAGING_SUMUP_API_KEY` | API key belonging to a SumUp sandbox merchant |
| `PR692_STAGING_SUMUP_MERCHANT_CODE` | That sandbox merchant's code |
| `PR692_STAGING_GOOGLE_PLACES_API_KEY` | Separate restricted Google Places credential for address verification |
| `PR692_STAGING_OWNER_ACCESS_KEY` | Random staging-only owner/driver test access key |
| `PR692_STAGING_QUOTE_RECEIPT_SECRET` | Random staging-only receipt signing key, retained across rollback rehearsals |

The environment variable `PR692_STAGING_FRONTEND_ORIGIN` must be the actual owned staging Vercel origin, using the `matni-pr692-staging` project naming prefix. Do not guess that an uncreated URL is available. The dedicated frontend must set both `NEXT_PUBLIC_ADDRESSES_API_URL` and `NEXT_PUBLIC_BOOKINGS_API_URL` to the staging Worker. Do not pull production environment files.

The pipeline first checks only boolean secret-slot presence. Missing configuration fails before credentials are used or resources/payments are created. It then verifies environment protection, performs a read-only SumUp merchant request and requires `sandbox: true` plus the expected merchant code. This check runs again at runtime before application requests and payment-capable Durable Object operations. There is no fallback to production credentials.

## Staging transport differences (explicit, not hidden)

Pricing, booking and SumUp handlers remain the release implementation. A separate staging entrypoint allowlists bindings and strips email-provider, calendar and Ads credentials. Confirmation payloads are written to staging KV under `staging:email:*` with seven-day retention and `delivery: captured-not-delivered`. Every attempted send is captured, so the transport does not hide duplicate callers.

Capture verifies generation, content and application-level duplicate suppression, **not external inbox delivery**. SumUp must use its real API with sandbox credentials; mocked tests are not substituted for provider verification. Fixture pricing is seeded into fresh staging storage only and never overwrites existing staging records. It is synthetic configuration, not a migration or copy of live customer data.

## Required test matrix after provisioning

1. Normal address selection and instant quote, BFS/BHD/DUB, Saloon/Estate, one-way/return, including the retained £45 BFS minimum, configurable supplement and 5% return discount.
2. Free default, paid terminal access and Meet & Greet on each applicable airport visit; no automatic Belfast access charge in the initial fare and no duplicate service fee.
3. Deposit and full online sandbox checkouts; exact validated totals, remaining cash, required acknowledgement and flight validation. Complete simulated successful and declined payments using SumUp's published sandbox test cards.
4. Verify saved records, captured customer/owner/driver confirmation content and repeat/concurrent confirmation calls. Check provider transaction IDs and amounts rather than trusting frontend success.
5. Exercise v2/v4 receipt compatibility and stale quotes. Old/old and new/new verification passes; mixed formats reject. Never remove signature verification or change a token prefix to force acceptance. Refresh outstanding quotes with explicit price acknowledgement; a cached old client also needs a tested reload/compatibility strategy.
6. Record a healthy staging deployment version, fixture record snapshots and pending/paid checkout IDs. Perform a controlled staging-only failed-version/rollback rehearsal. Confirm the restored version and unchanged totals, IDs, finalization markers and captured-notification counts, then roll forward again. Never delete storage or rerun migrations backwards.

## Production order recommendation — not authorized

Production remains blocked until real sandbox flow and rollback tests pass. First resolve old-client/new-Worker compatibility. An ordinary Worker-first rollout is not safe with the current mutually exclusive receipt formats. Prefer a separately reviewed compatibility bridge, then a matched frontend rollout; otherwise an explicitly approved controlled checkout cutover is required. Capture both deployment IDs before release and coordinate the currently independent auto-deploy integrations. Roll back code as a matched pair while preserving pending/paid records; do not restore an older database snapshot over payments.

No production merge, deployment, payment or live setting change is authorized by staging approval.

## Reference guidance

- https://developer.sumup.com/online-payments/testing
- https://developer.sumup.com/api/merchants (merchant `sandbox` flag)
- https://developers.cloudflare.com/durable-objects/reference/environments/
- https://developers.cloudflare.com/workers/wrangler/environments/
- https://vercel.com/docs/project-configuration/git-configuration
