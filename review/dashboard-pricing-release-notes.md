# Minimal dashboard pricing recovery

Recreated from main 501822c7b3cf3bd64f1555fabf91d8240406481a on local branch codex/dashboard-pricing-recovery. The prior uncommitted patch was not recovered. PR #674 was not resumed.

## Behaviour

Owner settings add starting charge £10, road-mile rate £2.20 and minimum fare £30. The formula switch defaults OFF. ON calculates max(minimum, starting charge + rate × passenger road miles), preserving existing fare rounding. Passenger count does not multiply the mileage rate.

OFF retains existing tiers, postcode priority and profitability protection. ON supersedes their fare amounts, while retaining all stored rules and settings. Airport charges/tolls, Estate supplement, return discount and independent night/weekend controls are unchanged. No festive changes. Older settings saves preserve the formula. Existing authenticated settings storage, optimistic version checks and audit history are used. The dashboard requires Worker capability version 1 before editing the formula (isolated preview is allowed).

No customer components, vehicle images, CSS, pages or booking/payment flow were changed. One existing Worker postcode-rounding eligibility check now respects the formula switch; all amount validation remains in place.

## Deployment safeguards proposed, not applied

- restore-worker-email.yml: remove its development-branch push trigger; retain manual operation only with a job-level `if: github.ref == 'refs/heads/main'` guard.
- sync-worker-address-secrets.yml: same restriction, preserving its secret-sync steps.
- deploy-worker.yml: add the same job-level main-branch guard so workflow_dispatch cannot deploy a selected development branch.
- Confirm any production environment approval/branch restrictions and credential access before relying on the guards. These YAML changes alone do not establish the saved GitHub configuration.
- Independently verify Cloudflare Worker Git integration: production branch main; non-production builds disabled, or demonstrably restricted to isolated previews with no production deploy command or bindings. The prior screenshot's non-production version command was `npx wrangler deploy`; its current saved state is not verified.

No workflow file or production setting was changed. Do not push while deployment protection remains unverified. No merge, deployment or activation is authorised by this recovery work.

## Test scope

The focused test blocks all external fetches and uses in-memory settings. It tests authenticated save/reload, malformed values, old-client saves, 172 synthetic postcode rules, ON/OFF precedence, configurable Estate, independent night/weekend rates, 5% journey discount, 12 Saloon/Estate single/return quote and payment-preparation cases, fixed charges once and mismatched-payment rejection. It does not create a real booking or payment session.

The browser test is prepared for Chromium/WebKit at 320, 360, 375, 390 and 1280px using local static files, preview storage and aborted external requests. Browser execution is blocked by invalid/truncated browser downloads; no browser PASS is claimed.

## Fresh results

- Focused reconstruction test: PASS (12 quote/payment-preparation cases; authenticated settings and precedence checks).
- Existing owner-pricing, open-website-payment-fares, airport-fixed-costs, airport-airport-access-fees, express-drop-off, night-weekend-surcharge, quote-authoritative-fare, payment-placeid-route-resolve and quote-schedule-price-gate scripts: 9/9 PASS, repeated with locked dependencies.
- Frontend TypeScript: PASS.
- Worker TypeScript and Wrangler `--dry-run`: PASS; no deployment.
- Browser runner syntax: PASS; actual Chromium/WebKit execution BLOCKED (download archives invalid/truncated, browser executable absent).
- Customer design source comparison: unchanged; visual browser verification remains pending.
- GitHub CI: not triggered (no push).
- Deployment protection: UNVERIFIED; no live settings changed.

To repeat locally: run `npm ci`, `node scripts/sync-worker-shared.mjs`, then `node --import tsx scripts/check-dashboard-formula-recovery.ts`. Build with both public API URLs pointed at an isolated backend, never omitted. The browser test requires a locally installed Playwright package and its Chromium/WebKit binaries; it serves `out` itself. `PLAYWRIGHT_MODULE` may point at a separately installed Playwright module to avoid changing project dependencies.
- Clean locked-dependency frontend static build/export: PASS (149 pages); API endpoints explicitly isolated. Existing lint warnings retained.
