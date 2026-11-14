# Bespoke quotes: isolated Cloudflare preview environment (proposal)

Status: **proposal only. Not created, not deployed.** Config file: `workers/addresses/wrangler.bespoke-preview.toml`. No workflow uses it, and its KV ids are placeholders, so it cannot be deployed by accident.

## Why not the existing `[env.preview]`?

The existing preview Worker (`wrangler.toml [env.preview]`) **binds the production KV namespaces** ("same booking KV so Owner Availability jobs are visible"). Testing bespoke payments there could write next to live bookings. A separate Worker is required.

## Isolation

| Concern | How it is isolated |
|---|---|
| Durable Objects / SQLite | Separate Worker name `reimagined-octo-meme-bespoke-preview`. Durable Objects belong to their Worker script, so preview objects (quotes, refunds, consent, registry) have their own storage, created by a single `preview-v1` migration. Production objects are unreachable. |
| KV | Two **new** namespaces (`BESPOKE_PREVIEW_TRACKING_STORE`, `BESPOKE_PREVIEW_BOOKING_COUNTER`). The placeholders make a deploy fail until they are created; production ids are documented as forbidden. A test checks they never appear. |
| Payments | `PAYMENT_PROVIDER = "stripe-test"`: Stripe only for `STRIPE_TEST_EMAILS`, with a **`sk_test_`** key. No SumUp secrets, so no other path can take money. Stripe holds off (immediate charge, as approved). A Stripe **test-mode** webhook endpoint points at the preview Worker. |
| SumUp sandbox | SumUp offers sandbox merchant accounts through its developer dashboard. Optional: only if you want to test the SumUp path; it would need sandbox credentials and `PAYMENT_PROVIDER` left at SumUp for that run. Recommended: test with Stripe first. |
| Emails | No `send_email` binding (Cloudflare Email cannot send). Bespoke emails are restricted by `BESPOKE_EMAIL_ALLOWLIST` (code added this phase; tested): every other recipient is logged "skipped". Optional separate, restricted Resend key, or none (emails then show "failed", which is fine for UI testing). |
| Turnstile | Cloudflare's documented test keys. Site key `1x00000000000000000000AA` (always passes) or `2x00000000000000000000AB` (always fails); secret `1x0000000000000000000000000000000AA`. No real widget, no production key. |
| Owner access | A **new preview-only** `OWNER_ACCESS_KEY`. Never the production key. |
| Customer links | `SITE_ORIGIN` = the preview site host, so quotation links never point at the live site. |
| Background jobs | Only the 5-minute cron (bespoke expiry sweep). No hourly job, so no review requests, quote reports or reminders. WhatsApp bot, flight watch and voice tools are switched off by variables. |
| Data | Test data only: tester names and emails. No production export is ever loaded. |

## Front end for preview

The site would be built with `NEXT_PUBLIC_BOOKINGS_API_URL=https://reimagined-octo-meme-bespoke-preview.<subdomain>.workers.dev/bookings` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`. It would be deployed to a **separate** Cloudflare Pages preview project, or served locally (`npx serve out`). It must not go to GitHub Pages: that is the live site. The CORS allow-list in `shared/google-places.ts` must include the preview host. This is a small, reviewable change for when the preview is approved.

## Steps after approval (owner actions marked ★)

1. ★ Approve creating two KV namespaces and one Worker in the Cloudflare account.
2. Create the KV namespaces and paste their ids into `wrangler.bespoke-preview.toml`.
3. ★ Provide Stripe **test** keys and create a test-mode webhook endpoint (`checkout.session.*` events) pointing at the preview Worker.
4. Set the preview secrets listed at the top of the config file (`wrangler secret put … --config wrangler.bespoke-preview.toml`).
5. Replace the tester email and preview host placeholders.
6. `npx wrangler deploy --config wrangler.bespoke-preview.toml`.
7. Run the Phase 3 preview test plan (`docs/bespoke-quotes-phase3-payment-design.md`).
8. When finished, delete the preview Worker and namespaces, or keep them for later phases.

Cost: Workers, KV and Durable Objects at test volumes fall within the existing plan's included usage. Stripe test mode is free. No paid services are added.
