# Fonio HTTP tool config (review copy)

**Approved for testing.** Wire these tools on a Fonio **test** assistant. Do not point production phone routing here until Worker deploy + Stripe test-mode checks are approved.

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

## 2. Address Search — during call

- URL: `…/voice/address-search`
- Method: POST
- When: caller gives a place that is not yet a confirmed Google location (hotel, landmark, village, incomplete address, airport name). **Do not demand a full postcode first** — search first.
- Fonio **template variables** must declare `place_query`, `place_role`, and `placeId` (otherwise the tool sends empty/`{{…}}` placeholders and lookups fail).

```json
{
  "query": "{{place_query}}",
  "role": "{{place_role}}",
  "placeId": "{{placeId}}"
}
```

`role` / `place_role` is `pickup` or `dropoff`. Leave `placeId` empty on the first search.

| `status` | Action |
|----------|--------|
| `confirm` | Speak `say` (brief confirmation). If caller agrees, call again with `placeId` from the response (or pass that `placeId` into Get Quote). |
| `clarify` | Speak `say` (one clarification). Use the matching option’s `placeId` when they choose. |
| `confirmed` | Place locked — use `placeId` + `displayAddress` (or `label`) in Get Quote so hotel/business names are kept. Fall back to `formattedAddress` only if display is empty. |
| `need_more` / `failed` | Speak `say`; ask postcode or Leave Message. Never invent an address. |

Confirm body (after “yes”):

```json
{
  "placeId": "{{placeId}}",
  "role": "{{place_role}}"
}
```

Uses the same server-side `GOOGLE_PLACES_API_KEY` as the website (never expose the key to Fonio).

---

## 3. Get Quote — during call

- URL: `…/voice/quote`
- Method: POST
- When: caller wants a price or to book a transfer **after** pickup/dropoff are confirmed (prefer Address Search first for conversational places)
- Body (custom variables with clear descriptions):

```json
{
  "pickup": "{{pickup}}",
  "dropoff": "{{dropoff}}",
  "pickupPlaceId": "{{pickupPlaceId}}",
  "dropoffPlaceId": "{{dropoffPlaceId}}",
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

Pass `pickupPlaceId` / `dropoffPlaceId` from Address Search whenever available, with the confirmed `displayAddress` (hotel/business + street) as `pickup` / `dropoff` — not street-only `formattedAddress`.  
When `ok` is true, speak only `say` (that is the fare).  
When `ok` is false, **do not quote a fare**. Follow `askNext` / `missing`, `unavailable`, `needsClearerAddress`, `toolFailed`, or `say` — never invent or reuse a previous amount.

---

## 4. Send Booking Link — during call

- URL: `…/voice/send-link`
- Method: POST

```json
{
  "quoteId": "{{quoteId}}",
  "mobile": "{{mobile}}",
  "email": "{{email}}",
  "name": "{{name}}",
  "channel": "{{channel}}"
}
```

`channel` is `sms` (UK 07 only), `whatsapp` (UK or international with country code), or `email`. Omit only if they have no preference (WhatsApp first; UK SMS fallback; otherwise offer email).

Fonio template variables: `quoteId`, `mobile`, `email`, `name`, `channel`.

After a successful send, tool `say` asks whether to stay on the line while they book and pay — speak that question; do not skip it.

Message status fields (use accurate customer wording):

| `messageStatus` | Meaning | What to say |
|-----------------|---------|-------------|
| `generated` | Link/SMS text prepared; not yet handed to the carrier | Speak `say` (“I'm sending it now”). If `sendBySms`, run Fonio Send SMS with `smsText`. Do **not** claim the text arrived. |
| `accepted` | API accepted the message for sending | Speak `say` or, after SMS, `sayAfterSmsAccepted`. Do **not** claim handset delivery. |
| `delivered` | Handset delivery confirmed (only if the tool returns this) | Only then say the message was delivered. |

Do not read internal driver-assignment rules to the caller — speak only tool `say` fields.  
The booking URL is our genuine `/book-quote/?id=…` link; customers pay via Stripe Checkout. Never invent payment URLs or collect card details on the call.

---

## 5. Provisional Booking — during call

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

## 6. Booking Lookup — during call

- URL: `…/voice/booking`
- Method: POST

```json
{
  "reference": "{{reference}}",
  "mobile": "{{mobile}}"
}
```

---

## 7. Booking Link (Manage Booking) — during call

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

## 8. Leave Message — during call

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

## 9. After Call — after conversation

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
