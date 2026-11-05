# Fonio end-to-end integration — PASS / FAIL report

_Generated 2026-11-05T00:38:47.615Z by scripts/check-voice-e2e-integration.ts_

**Scope:** branch Worker handlers + shared quote/pricing rules + read-only production probes.
**Not in scope this run:** live Fonio phone call, real SMS carrier delivery, real Stripe charges, production deploy.

## Score: 17 PASS · 3 FAIL · 4 BLOCKED

| ID | Area | Result | Detail |
|----|------|--------|--------|
| T01 | Auth | **PASS** | assertions held |
| T02 | Inbound | **PASS** | assertions held |
| T03 | Conversation / quote draft | **PASS** | assertions held |
| T04 | Pricing rules (spoken) | **PASS** | assertions held |
| T05 | SMS / WhatsApp messageStatus | **PASS** | assertions held |
| T06 | Provisional booking + expiry | **PASS** | assertions held |
| T07 | Booking lookup | **PASS** | assertions held |
| T08 | Cancellation / manage links | **PASS** | assertions held |
| T09 | Leave Message (failed tool / urgent) | **PASS** | assertions held |
| T10 | After Call webhook | **PASS** | assertions held |
| T11 | Stripe Checkout test-mode wiring | **PASS** | assertions held |
| P01 | Production Worker | **FAIL** | /voice/inbound → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR) |
| P02 | Production Worker | **PASS** | /voice/quote → HTTP 200; body keys=ok,missing,say |
| P03 | Production Worker | **PASS** | /voice/send-link → HTTP 200; body keys=ok,say |
| P04 | Production Worker | **FAIL** | /voice/provisional-booking → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR) |
| P05 | Production Worker | **PASS** | /voice/booking → HTTP 200; body keys=ok,found,say |
| P06 | Production Worker | **PASS** | /voice/booking-link → HTTP 200; body keys=ok,say |
| P07 | Production Worker | **FAIL** | /voice/message → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR) |
| P08 | Production Worker | **PASS** | /voice/call-ended → HTTP 200; body keys=ok,queued,reason |
| L01 | Live Fonio | **BLOCKED** | Live Fonio assistant call not executed here — paste approved prompt/tools in Fonio dashboard, then place a test call |
| L02 | Live Fonio SMS | **BLOCKED** | Fonio Send SMS add-on + handset delivery receipt not verified in this environment (accepted≠delivered covered in T05) |
| L03 | Stripe Checkout live test-mode charge | **BLOCKED** | No Stripe test keys in this environment; do not use live keys. Complete /book-quote Checkout with sk_test_ + PAYMENT_PROVIDER=stripe-test after Worker deploy |
| L04 | Production deploy | **BLOCKED** | Worker/Pages production deploy intentionally not performed (awaiting approval). Several /voice/* routes still 404 on production. |
| T12 | Prompt freeze | **PASS** | assertions held |

## Failures that block live Fonio testing
- **P01** (Production Worker): /voice/inbound → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR)
- **P04** (Production Worker): /voice/provisional-booking → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR)
- **P07** (Production Worker): /voice/message → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR)

## Configuration required inside Fonio (before live test call)
1. Paste approved prompt from `docs/fonio-receptionist-prompt.md` into the test assistant.
2. Wire HTTP tools per `docs/fonio-tool-config.md` (Base URL production Worker **after** approved deploy, or a preview Worker URL).
3. Auth header on every tool: `Authorization: Bearer <VOICE_WEBHOOK_SECRET>` once the secret is set on the Worker.
4. Inbound Webhook → `POST /voice/inbound` (currently **404 on production** until Worker deploy).
5. During-call tools: Get Quote, Send Booking Link, Provisional Booking, Booking Lookup, Booking Link, Leave Message.
6. After Call → `POST /voice/call-ended`.
7. Enable Fonio **Send SMS** add-on; on `messageStatus=generated`, run Send SMS with `smsText`, then speak `sayAfterSmsAccepted` (not handset delivered).
8. Execution sentence: `One moment please, I'm just checking that for you.`

## Stripe test-mode checklist (no live charges)
- Worker: `PAYMENT_PROVIDER=stripe-test`, `STRIPE_SECRET_KEY=sk_test_…`, allowlist email in `STRIPE_TEST_EMAILS`.
- Open `/book-quote/?id=…` from a phone quote/provisional hold; pay with Stripe test card `4242…`.
- Confirm Booking Lookup only after webhook marks paid — never invent paid/driver-assigned from Checkout success page alone.

## Conversational scenarios covered locally
- One-question-at-a-time missing fields; corrected destination mid-flow; return journey; oversized party (no fare); same-airport (no fare).
- Failed-tool escalation via Leave Message; After Call with/without consent.
- Returning-customer booking lookup requires reference + mobile.
- Live spoken interruptions still need a real Fonio test call (L01).

## Deploy gate
Do **not** deploy Worker/Pages/Fonio production without explicit approval.
Until the Worker from this PR is deployed, production Fonio cannot use inbound / provisional / message tools (404).
