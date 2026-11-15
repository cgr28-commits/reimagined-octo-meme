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
`askDateTime` is `"yes"` while an evening, night or weekend surcharge is switched on in the owner dashboard, otherwise `"no"`. Only ask for the date and pickup time when it is `"yes"`; when `"no"` the caller picks them on the booking link (Get Quote still accepts them if the caller volunteers them, and asks for them via `askNext` if the setting changes mid-call). Declare `askDateTime` as a Fonio inbound variable.  
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
Always fill `name`, `mobile` (confirmed number or caller ID) and `message` (journey, date, time,
passengers). Without a mobile the Worker answers `ok: false` and nothing is saved — the
receptionist must never say the message was passed on in that case (15 Nov 2026 call).

---

## 8b. Send Quote Form — during call (added 15 Nov 2026)

- URL: `…/voice/quote-form`
- Method: POST (same auth header as the other voice tools)
- When: Olivia can't pin down an address after asking once for the street or postcode.
- Sends the caller our WhatsApp quote form (the same Flow the WhatsApp assistant uses); they
  tap their addresses, date, time and bags, and the fixed price comes back in WhatsApp.

```json
{
  "mobile": "{{mobile}}",
  "pickup": "{{pickup}}",
  "dropoff": "{{dropoff}}"
}
```

Reply: `{ ok, sent, say }`. `sent: false` happens when WhatsApp refuses a form to a number that
hasn't messaged us in the last 24 hours; `say` then asks for the postcode instead.

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

---

## After-call text (fonio Send SMS, added 15 Nov 2026)

Second fonio **SMS** integration (Abilities → Send SMS): Run **After the conversation**, Send **Only if…**
"the caller's number is a UK mobile, the call was about a new price or booking, and they did not get a
booking link on the call". To: **The caller**. From: `MyAirportNI`. Fixed message:

> My Airport Taxi NI: thanks for calling. Get your fixed price and book here: https://www.myairporttaxini.co.uk/?src=call#quote

Runs alongside the Worker's WhatsApp follow-up (`mat_call_followup`, `/voice/call-ended`), owner chose "both".
fonio plan: 50 SMS/month included; extra 50 for £9.
