# PR #692 — compatible release verification

This report supersedes the earlier requirement for a separate staging Worker. No infrastructure, live settings, production deployment or payments have been changed. Final CI status is recorded in PR #692.

## Compatibility

The Worker verifies both `v2-bfs-minimum` and `v4-optional-terminal-access` using the original signed namespace. It does not relabel signatures. Signature, expiry, pricing-version and journey binding checks remain mandatory. A supplied invalid token is rejected even when profitability protection is disabled.

New clients explicitly request optional-access quotes. Old clients continue receiving v2 receipts and the previous A2A fixed costs. Payment policy is selected by the verified receipt; unsigned older forms are detected by absence of the new protocol/per-visit fields and still undergo server fare recalculation. The new protocol cannot reuse a legacy receipt with new service choices. Every checkout still checks the exact displayed/accepted total before contacting SumUp.

Existing unexpired quotes retain their signed vehicle fare under the original rules. Owner pricing-version changes still require a refresh, as before. Old clients retain their original access/M&G pricing until reload; this includes historical separately charged terminal access. New clients get optional free/paid access and inclusive Meet & Greet without a second access fee. Mileage tariffs, minima, vehicle supplements, return discount and Dublin tariffs are unchanged.

## Duplicate-request finding and correction

A concurrent browser-return/webhook test exposed a pre-existing race: two simultaneous finalizations produced four emails instead of two. Sequential replay tests had not detected it.

The existing `QUOTE_LEAD_COORDINATOR` binding now serializes payment creation and finalization in separate hashed Durable Object IDs. No new namespace, database, secret or migration is needed. Successful results are reused; different payment details for an already-started journey are rejected rather than opening a second checkout. Validation failures/not-yet-paid confirmations can retry. An interrupted/uncertain provider operation remains blocked for owner reconciliation, rather than assuming failure and risking repetition. Completed operation records expire after 60 days; existing booking-record checks remain thereafter.

This is an at-most-once guard, not a claim of a transaction spanning SumUp, KV and email providers. After an ambiguous timeout the owner must check the provider and stored checkout before any retry/reset. Never clear an operation claim solely because time elapsed. Local/test installations without the binding retain the previous behavior; the production release preflight requires the already-existing binding. A binding error does not fall back to uncoordinated processing.

Finalization also compares the provider checkout ID, reference, GBP currency and amount against the saved pending record before writing a paid booking or sending confirmations. Stored deposit/full amounts are never recalculated from later pricing settings.

## Evidence and limitations

- 216 original-main browser cases: previously issued v2 quotes, refreshed old-browser quotes, and checkouts created by the old Worker then finalized by the new one; three airports, directions, vehicles, returns, optional M&G and deposit/full payments.
- Original main is pinned to `2c6bfb59a9fad54389990f217ee3b0cc056af93b` in CI. Legacy A2A fee resolutions are compared directly with its implementation.
- 864 new-format quote/payment/storage/confirmation cases and 192 signed/unsigned BFS payment cases.
- Tampering, changed namespaces, expiry, changed journey/version, concurrent creation/finalization, replay and uncertain-operation checks.
- TypeScript, lint, frontend/Worker builds, pricing regressions and Chromium/WebKit mobile checks are required on the final commit.

Payment/Google/email/calendar responses and Durable Object storage are isolated in these tests. They establish application behavior, not live credential validity, SumUp availability, real inbox delivery or Cloudflare runtime performance. The SumUp HTTP request/response integration and deployed credentials are unchanged. No specific provider contract change currently justifies six staging secrets and a duplicate environment. A sandbox would become useful if provider request contracts change or a provider-specific failure cannot be reproduced with the fixtures.

## Coordinated production procedure — approval required

Current deployment triggers remain unchanged: main pushes trigger GitHub Pages; matching Worker/shared paths trigger the Cloudflare workflow; Vercel builds configured Git branches. Pages and Worker jobs otherwise run independently. A merge alone is **not** the release procedure.

After explicit production approval:

1. Recheck final PR/main SHAs, CI and production binding names. Capture the current Cloudflare deployment/version ID, current Pages artifact/commit and public pricing version. Retain current signing secret and all storage bindings. Do not rotate credentials or change pricing.
2. Run the existing **Deploy Cloudflare Worker** workflow against the exact reviewed PR branch/commit before merging. Do not select fixture seeding; confirm the resend trigger is off. This deploys the compatible backend while the old frontend is still live.
3. Confirm deployment success and read-only public quote/address health. Verify v2/v4 response formats with non-booking quote requests only. Do not initiate a real checkout or charge. If the Worker fails, do not merge or publish the frontend.
4. Only after the compatible backend is verified, merge the approved PR. The automatic Worker redeploy is the same compatible code; Pages may safely publish after or alongside it. Confirm Vercel is a preview surface and the live custom domain remains on its intended host.
5. Check homepage/autocomplete, quotes and payment method display without making a real payment. Monitor errors and the next legitimate customer checkout using minimal owner-authorized records. Escalate provider mismatches and uncertain-operation alerts; never automatically retry a charge.

## Rollback

Prefer rolling the frontend back while retaining the compatible Worker. It supports both cached frontends and both receipt formats. Existing pending checkout amounts and paid records remain untouched. Do not roll the Worker straight back to pre-compatibility main while v4 sessions remain active.

If the compatible Worker itself needs rollback, use a reviewed compatible corrective build, or an explicitly approved controlled pause of new checkout creation while retaining payment confirmation/reconciliation. Capture and restore code versions only; never restore an old database snapshot over new payments, delete namespaces, reverse migrations or rotate the signing key. Ambiguous payment operations need provider reconciliation before any operation-state reset.

No migration is required. A real deployed rollback rehearsal has not been performed; local storage compatibility and unchanged binding/migration definitions do not establish operational rollback success.
