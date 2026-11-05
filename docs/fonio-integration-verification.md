# Fonio integration verification status

_Generated 2026-11-05 (Europe/London). No production deploy. No real SMS/charges. Prompt body not modified._

## Verdict

**Not ready for a live customer call yet.** Backend tools on this PR branch work under automated tests; production Worker is missing three voice routes and the owner call-log endpoint; **Fonio dashboard install of the prompt/tools cannot be confirmed from here** (no assistant config API; no `FONIO_API_KEY` in this environment).

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Latest prompt installed **in Fonio** (not only in repo) | **NOT VERIFIED** | Fonio public API has outbound/test-key only — no read of assistant prompt. No `FONIO_API_KEY` here. Needs manual open of Fonio assistant → Prompt and confirm it matches `docs/fonio-receptionist-prompt.md`. |
| 2 | Every HTTP tool configured + connected to our site | **PARTIAL** | Repo tool map is complete (`docs/fonio-tool-config.md`). **Production Worker** (`reimagined-octo-meme.cgr28.workers.dev`): quote / send-link / booking / booking-link / call-ended **live**; inbound / provisional-booking / message / owner/voice-calls → **HTTP 404**. Tools pointed at production for those three will fail until approved Worker deploy from this PR. Fonio tool URLs themselves are dashboard-only — not readable remotely. |
| 3 | Payment links use Stripe Checkout | **PASS (code path)** | Voice returns `/book-quote/?id=…` only; checkout is existing `/payments` → Stripe when `PAYMENT_PROVIDER=stripe-test`/`stripe`. Provisional never creates Checkout or marks paid. **No live test-mode charge run** (no `sk_test_` in this env). |
| 4 | Natural questions; no repeated business name | **PASS (spoken `say` fields)** / **NOT VERIFIED (live Fonio speech)** | Greeting uses full name once; quote / link / payment / booking `say` strings omit “My Airport Taxi NI”. Live Fonio adherence needs a test call after prompt paste. |
| 5 | Quote, booking link, SMS statuses, provisional, lookup | **PASS (branch handlers + automated)** / **PARTIAL (production)** | Local E2E: quote ok=false no fare; send-link `messageStatus=generated` vs `accepted`, `delivered=false`; provisional + expiry; booking lookup. Production: quote/send-link/booking OK; provisional **404**. |
| 6 | Approved customer-facing response fields used | **PASS (branch)** / **FAIL (production send-link)** | Branch returns `say`, `sayAfterSmsAccepted`, `messageStatus`, `sendBySms`, `smsText`. Production send-link still returns only `{ok,say}` (older build) — no `messageStatus` until Worker deploy. |
| 7 | Never confirm unavailable / unverified pay / unassigned driver | **PASS (branch guards)** | Unavailable → `ok:false` + no fare; paid only via Booking Lookup; payment copy uses `VOICE_BOOKING_AFTER_PAYMENT_SAY` (no driver-assigned-after-Stripe). Fonio must read tool fields — live behaviour not verified. |
| 8 | Call summaries / enquiries reach admin | **PASS (branch)** / **FAIL (production)** | `/voice/call-ended` logs + optional follow-up queue locally; owner list is `GET /owner/voice-calls`. Production: call-ended responds; **`/owner/voice-calls` → 404** (not deployed). Leave Message route also **404** on production. |
| 9 | Automated tests, test data, no real messages/charges | **PASS** | `scripts/check-voice-e2e-integration.ts` + voice suites: **17 PASS** local; WhatsApp mocked; Stripe mode gated; production probes used fake MAT-0000 / consent=no only. |

## What is working

- Branch `/voice/*` handlers for the full tool set (inbound, quote, send-link, provisional, booking, booking-link, message, call-ended).
- Spoken company voice on `say` fields (we/us; name once in greeting).
- SMS lifecycle fields on branch: `generated` ≠ `accepted` ≠ `delivered`.
- Stripe Checkout wiring via `/book-quote` + `stripe-test` allowlist (no charge in this run).
- Production already serves: Get Quote, Send Booking Link (legacy body), Booking Lookup, Booking Link, After Call.

## What is not working / blocked

1. **Cannot confirm Fonio has the approved prompt** without dashboard access.
2. **Production Worker missing:** `/voice/inbound`, `/voice/provisional-booking`, `/voice/message`, `/owner/voice-calls`.
3. **Production send-link** lacks `messageStatus` / `sayAfterSmsAccepted` (pre-PR behaviour).
4. **Live Fonio call, Fonio SMS carrier, Stripe test card payment** not run here.
5. **No production deploy** performed (awaiting your approval).

## Manual configuration still required inside Fonio

Do this on a **test** assistant (not production number routing) until Worker deploy is approved:

1. Paste prompt from `docs/fonio-receptionist-prompt.md` and screenshot/confirm it matches (closes check #1).
2. Create HTTP tools exactly as `docs/fonio-tool-config.md` — Base URL must be a Worker that has **all** routes (after approved deploy), not the current production build for inbound/provisional/message.
3. Header on every tool: `Authorization: Bearer <VOICE_WEBHOOK_SECRET>` once that secret is set on the Worker.
4. Inbound Webhook → `POST …/voice/inbound`.
5. After Call → `POST …/voice/call-ended` with summary + consent variables.
6. On Send Booking Link: if `messageStatus=generated` / `sendBySms`, run Fonio **Send SMS** with `smsText`, then speak `sayAfterSmsAccepted` — never claim handset delivery unless `messageStatus=delivered`.
7. Enable SMS add-on if SMS backup is required.
8. Place one test call to a non-customer mobile; confirm greeting once, no repeated business name, quote → link → (test) Stripe → Booking Lookup.

## Deploy gate

**Do not deploy Worker/Pages or point the live NI number at this stack without explicit approval.**  
Next approval needed to unblock production FAILs: deploy Worker from PR branch `cursor/fonio-voice-integration-audit-d343`.
