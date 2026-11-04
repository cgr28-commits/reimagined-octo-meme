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

Speak returned `greeting` once (Europe/London morning/afternoon/evening + full business name once).  
Use `name` / `sayHint` only as guidance. Never invent booking details from inbound context.

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

Speak only `say`. Honour `askNext`, `unavailable`, `needsClearerAddress`, `toolFailed`.

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

If `sendBySms` is true, trigger Fonio Send SMS to Caller with `smsText` (requires SMS add-on).  
Only after SMS succeeds, speak `sayAfterSmsSent` (do not claim delivery from the initial `say`).

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
