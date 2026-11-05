# Fonio HTTP tool config (review copy)

**Do not change the live Fonio assistant until explicitly approved.**

Base URL: `https://reimagined-octo-meme.cgr28.workers.dev`  
Auth header on every tool (once `VOICE_WEBHOOK_SECRET` is set):

```json
{
  "Authorization": "Bearer <VOICE_WEBHOOK_SECRET>",
  "Content-Type": "application/json"
}
```

Execution sentence for every during-call tool:  
`One moment please, I'm just checking that for you.`

---

## 1. Inbound Webhook — before call

- URL: `…/voice/inbound`
- Method: POST
- Body:

```json
{
  "fromNumber": "{{personNumber}}",
  "toNumber": "{{Call: To number}}"
}
```

Speak returned `greeting` **once only** (Europe/London morning/afternoon/evening, including daylight saving, + full business name once).  
Use `name` / `sayHint` only as guidance. Never invent booking details from inbound context. Do not rebuild or repeat the greeting later in the call.

---

## 2. Get Quote — during call

- URL: `…/voice/quote`
- Method: POST
- When: caller wants a price or to book a transfer
- Body (custom variables with clear descriptions):

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

When `ok` is true, speak only `say` (that is the fare).  
When `ok` is false, **do not quote a fare**. Follow `askNext` / `missing`, `unavailable`, `needsClearerAddress`, `toolFailed`, or `say` — never invent or reuse a previous amount.

---

## 3. Send Booking Link — during call

- URL: `…/voice/send-link`
- Method: POST

```json
{
  "quoteId": "{{quoteId}}",
  "mobile": "{{mobile}}",
  "name": "{{name}}"
}
```

Message status fields (use accurate customer wording):

| `messageStatus` | Meaning | What to say |
|-----------------|---------|-------------|
| `generated` | Link/SMS text prepared; not yet handed to the carrier | Speak `say` (“I'm sending it now”). If `sendBySms`, run Fonio Send SMS with `smsText`. Do **not** claim the text arrived. |
| `accepted` | WhatsApp/SMS API accepted the message for sending | Speak `say` or, after SMS, `sayAfterSmsAccepted` (legacy alias: `sayAfterSmsSent`). You may say we have sent the secure link. Do **not** claim handset delivery. |
| `delivered` | Handset delivery confirmed (only if the tool returns this) | Only then say the message was delivered. |

Never promise a named/assigned driver because Stripe payment succeeded — payment verifies booking status via Booking Lookup only.  
The booking URL is our genuine `/book-quote/?id=…` link; customers pay via the existing Stripe Checkout flow. Never invent payment URLs or collect card details on the call.

---

## 4. Provisional Booking — during call

- URL: `…/voice/provisional-booking`
- Method: POST

```json
{
  "quoteId": "{{quoteId}}",
  "name": "{{name}}",
  "email": "{{email}}",
  "mobile": "{{mobile}}",
  "termsAccepted": "yes"
}
```

Only after Get Quote succeeded and the caller agreed to terms. Never mark paid.

---

## 5. Booking Lookup — during call

- URL: `…/voice/booking`
- Method: POST

```json
{
  "reference": "{{reference}}",
  "mobile": "{{mobile}}"
}
```

---

## 6. Booking Link (Manage Booking) — during call

- URL: `…/voice/booking-link`
- Method: POST

```json
{
  "reference": "{{reference}}",
  "mobile": "{{mobile}}"
}
```

SMS fallback same as Send Booking Link (`sendBySms` + `smsText`).

---

## 7. Leave Message — during call

- URL: `…/voice/message`
- Method: POST

```json
{
  "name": "{{name}}",
  "mobile": "{{mobile}}",
  "message": "{{message}}",
  "urgent": "{{urgent}}",
  "pickup": "{{pickup}}",
  "destination": "{{destination}}"
}
```

Use for tool failures, out-of-hours, unclear journeys, callbacks and urgent escalation.

---

## 8. After Call — after conversation

- URL: `…/voice/call-ended`
- Method: POST

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

Owner review: `GET …/owner/voice-calls` with `X-Owner-Key`.

---

## Approval gate

1. Deploy Worker with these routes (PR).  
2. Set `VOICE_WEBHOOK_SECRET` in GitHub Actions / Cloudflare.  
3. Get written approval.  
4. Paste prompt from `docs/fonio-receptionist-prompt.md`.  
5. Create/update HTTP tools as above.  
6. Real test call to a non-customer mobile before public routing.
