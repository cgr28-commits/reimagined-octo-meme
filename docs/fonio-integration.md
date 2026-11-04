# Fonio AI telephone receptionist — integration guide

**Do not change live fonio assistant settings, phone numbers, or webhooks without explicit approval.**

This document is the technical audit outcome and the approved wiring checklist for My Airport Taxi NI. Worker endpoints already exist (or are added in-repo); fonio dashboard configuration is a separate, approval-gated step.

Official fonio docs used for this audit (no invented endpoints):

| Topic | Source |
|-------|--------|
| HTTP Request (before / during / after call) | https://fonio.info/en/developers/http-request |
| Inbound Webhook (caller lookup ≤5s) | https://fonio.info/en/developers/inbound-webhook |
| Post-call webhooks & variables | https://fonio.info/en/setup/webhooks-and-variables |
| Outbound API | https://fonio.info/en/developers/outbound-api |
| Public API (OpenAPI) | https://app.fonio.ai/api/docs |
| API keys | https://fonio.info/en/get-started/troubleshooting/api-keys |
| Send SMS action | https://fonio.info/en/actions/sms |

---

## 1. What fonio officially supports

### Our system ← fonio (webhooks / HTTP tools)

1. **Inbound Webhook** — before an incoming call, fonio GET/POSTs the caller number to our URL; we return JSON within **5,000 ms**.
2. **HTTP Request** — before, **during**, or after a conversation. Methods: GET, POST, PUT, PATCH, DELETE. Custom variables + headers (including `Authorization: Bearer …`). During-call responses ≤ **96,000** characters; keep JSON small. Default during-call wait is ~**5 seconds**.
3. **Send SMS / Email** — native actions (SMS needs the SMS add-on). Useful backup for booking links.
4. **Egress IPs** (allowlist if you firewall): `128.140.42.143`, `128.140.34.113`, `167.233.91.1`, `167.233.75.149`, `178.105.222.76`.

### Our system → fonio (public API)

Documented at `https://app.fonio.ai/api/docs`:

- `POST /public/v1/outbound_call` — start an outbound call (`fromNumber`, `toNumber`, `agentId`, optional `context`). Auth: `Authorization: Bearer <FONIO_API_KEY>` or body `apiKey`.
- `POST /public/v1/test-api-key` — validate a key.
- Reseller / remote-integration-server endpoints (not needed for inbound receptionist).

**Not available** (as of fonio docs / partner notes through 2026): a configuration API for assistants, knowledge-doc upload API, or analytics API. Assistant prompts, HTTP tools and webhooks are configured in the fonio dashboard only.

There is **no** fonio-signed webhook signature scheme documented. Authentication of inbound traffic is by **shared secret in headers we configure** on each HTTP Request / Inbound Webhook, plus optional IP allowlisting.

---

## 2. Access & permissions required before go-live

Complete these **before** pointing a live NI number at production Worker URLs or editing the live assistant:

| # | Access / permission | Owner | Why |
|---|---------------------|-------|-----|
| 1 | fonio account login (admin) | Business owner | Configure assistant, tools, headers — **approval required per change** |
| 2 | fonio **API key** (Settings → API keys) | Owner → store as Worker secret `FONIO_API_KEY` only if outbound is approved | Outbound callbacks later; not required for inbound quotes |
| 3 | fonio **agentId** for the production assistant | Owner | Shown under assistant → Webhooks → Outbound API |
| 4 | fonio phone number + **KYC** (Subscription & Billing) | Owner | Required for outbound; inbound needs the number routed to the assistant |
| 5 | fonio **SMS add-on** (optional) | Owner | Backup when WhatsApp cannot deliver the booking link |
| 6 | Cloudflare Worker secret `VOICE_WEBHOOK_SECRET` | Ops | Shared secret fonio sends on every `/voice/*` call |
| 7 | GitHub Actions secret sync for `VOICE_WEBHOOK_SECRET` | Ops | So deploys keep the secret on the Worker |
| 8 | WhatsApp templates already used by voice (`mat_quote_link`, `mat_call_followup`, booking details) | Already in repo | Link delivery + dropped-call follow-up |
| 9 | Approval to set HTTP Request headers on the assistant to `Authorization: Bearer <VOICE_WEBHOOK_SECRET>` | Owner (dashboard) | Without this, enabling the Worker secret returns 401 to fonio |
| 10 | Explicit written approval to modify **live** fonio settings | Owner | Hard rule for this integration |

**Do not** commit fonio API keys, `VOICE_WEBHOOK_SECRET`, or customer call recordings into the repo.

---

## 3. Existing MATNI systems the phone line reuses

| Capability | Source of truth | Phone surface |
|------------|-----------------|---------------|
| Saloon / Estate / Business Class / Minibus pricing, BFS/BHD floors, airport fixed costs, **5% return discount** | `src/lib/quote.ts` + `shared/*` via `createPricedQuickQuote` | `POST /voice/quote` |
| Availability / notice / closed periods | Same Smart Ops + owner blocks as WhatsApp | Checked inside `/voice/quote` — unavailable → spoken refusal, **no fare** |
| Secure payment | SumUp Hosted Checkout after customer confirms on `/book-quote/?id=…` | Link from `/voice/quote` + `/voice/send-link` (WhatsApp) or fonio SMS with `smsText` |
| Provisional unpaid hold | Booking job `awaiting_payment` (`MATNI-…`) | `POST /voice/provisional-booking` — **never** sets paid |
| Paid booking lookup | Paid booking KV; reference **and** mobile required to speak details | `POST /voice/booking`, `/voice/booking-link` |
| Call summary log | KV call log (redacted) | `POST /voice/call-ended` → `GET /owner/voice-calls` |
| Caller greeting context | Upcoming paid bookings by mobile | `GET|POST /voice/inbound` — first name only, no journey details |

**Never:** invent a fare in the prompt, confirm a slot after availability said no, or tell a caller they are paid before SumUp reports `PAID`.

Company voice on the phone: **we** / **your driver** (existing `say` strings and booking summaries already follow this).

---

## 4. Worker endpoints (already in this repo)

Base URL (production Worker): `https://reimagined-octo-meme.cgr28.workers.dev`

All `/voice/*` routes accept `Authorization: Bearer <VOICE_WEBHOOK_SECRET>` or `X-Voice-Secret: <VOICE_WEBHOOK_SECRET>` when the secret is set.

| Method | Path | When fonio runs it | Purpose |
|--------|------|--------------------|---------|
| GET/POST | `/voice/inbound` | Inbound Webhook (before call) | Minimal caller context |
| POST | `/voice/quote` | During call — “get a price” | Fixed price + booking link draft |
| POST | `/voice/send-link` | During call — “send the link” | WhatsApp (SMS fallback body) |
| POST | `/voice/provisional-booking` | During call — hold without payment | Unpaid `MATNI` job + same secure link |
| POST | `/voice/booking` | During call — existing booking | Spoken summary only if ref + mobile match |
| POST | `/voice/booking-link` | During call | Manage Booking link to number **on the booking** |
| POST | `/voice/call-ended` | After conversation | Redacted summary log + optional follow-up |
| GET | `/owner/voice-calls` | Owner dashboard / tooling | List redacted call logs (`X-Owner-Key`) |

### Recommended during-call tool bodies

**Quote** — custom variables with clear descriptions (pickup, dropoff, date, time, passengers, suitcases, returnJourney, returnDate, returnTime, flightNumber):

```json
{
  "pickup": "{{pickup}}",
  "dropoff": "{{dropoff}}",
  "date": "{{date}}",
  "time": "{{time}}",
  "passengers": "{{passengers}}",
  "suitcases": "{{suitcases}}",
  "returnJourney": "{{returnJourney}}",
  "returnDate": "{{returnDate}}",
  "returnTime": "{{returnTime}}",
  "flightNumber": "{{flightNumber}}"
}
```

Speak only the `say` field from the JSON response. If `ok` is false, do not invent a price.

**Send link** after a successful quote:

```json
{ "quoteId": "{{quoteId}}", "mobile": "{{mobile}}", "name": "{{name}}" }
```

If the response includes `sendBySms: true`, use fonio’s Send SMS action with `smsText`.

**Provisional booking** (after quote + customer details + verbal terms):

```json
{
  "quoteId": "{{quoteId}}",
  "name": "{{name}}",
  "email": "{{email}}",
  "mobile": "{{mobile}}",
  "termsAccepted": "yes"
}
```

**After call:**

```json
{
  "fromNumber": "{{personNumber}}",
  "conversationId": "{{conversationId}}",
  "summary": "{{summary}}",
  "followUpConsent": "{{followup_consent}}",
  "bookingLinkSent": "{{booking_link_sent}}",
  "existingBooking": "{{existing_booking}}",
  "name": "{{name}}",
  "pickup": "{{pickup}}",
  "destination": "{{destination}}",
  "quoteId": "{{quoteId}}",
  "bookingReference": "{{bookingReference}}"
}
```

Exact variable names must match what you define in the fonio action; use **Add Variable** in the dashboard. Test with a real inbound call — browser tests do not always send the caller number.

---

## 5. Approval-gated fonio dashboard checklist

Only after Worker secret `VOICE_WEBHOOK_SECRET` is deployed:

1. Open the production assistant → Webhooks / Integrations.
2. **Inbound Webhook** → our `/voice/inbound`, method POST, header `Authorization: Bearer …`.
3. Add HTTP Requests for quote, send-link, provisional-booking, booking, booking-link (during call) and call-ended (after call), each with the same auth header.
4. Set execution sentences (“One moment, I’m checking that for you…”) so the model does not invent answers while waiting.
5. Prompt rules (keep in the assistant prompt, not in this repo’s secrets):
   - Use **we** and **your driver**.
   - Prices only from `/voice/quote` `say` / `price`.
   - If unavailable, do not offer a fare.
   - Never say a booking is paid unless looking up a verified paid booking.
   - Changes/cancellations → Manage Booking link only.
6. Optional: Send SMS action using `smsText` when WhatsApp fails.
7. Audio test + one real test call to a non-customer mobile.
8. Only then route the public NI number.

---

## 6. Security invariants

- Credentials stay in Cloudflare / GitHub Actions secrets.
- Fares only from the website pricing engine (Saloon, Estate uplift, Vito/7-seater = Minibus path in marketing; pricing uses Minibus).
- Return discount remains the configured **5%** on journey base (airport fixed costs undiscounted).
- Availability refusal = no quote.
- Provisional jobs stay `awaiting_payment` until SumUp (or Stripe) verification in `finalizePaidCheckout`.
- Booking details spoken only when **MAT reference + mobile** match.
- Call logs store phone **suffix**, short summary, and outcome — not full transcripts or card data.
- Duplicate provisional creates reuse the same `MATNI` reference per `quoteId`.
