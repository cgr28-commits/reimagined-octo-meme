# Fonio live configuration (quotation + address search)

**Live on Fonio (Olivia):** approved receptionist prompt, Inbound Webhook, Address Search, Get Quote (with Place IDs), Booking Lookup, Booking Link, Send Booking Link, Leave Message, Provisional Booking, After Call.  
**Worker:** `VOICE_ENABLE_BOOKING_TOOLS=1` in production Worker vars so Send Booking Link / Provisional Booking are live. Ask text vs WhatsApp (`channel`: `sms` | `whatsapp`); omit only when no preference (WhatsApp first, SMS fallback). Never tell callers they are on a landline — inbound CLI is often the diverted business line.

Base URL: `https://reimagined-octo-meme.cgr28.workers.dev`

Auth (once `VOICE_WEBHOOK_SECRET` is set on the Worker):

```json
{
  "Authorization": "Bearer <VOICE_WEBHOOK_SECRET>",
  "Content-Type": "application/json"
}
```

## Enable these HTTP tools in Fonio now

| Tool | Method | Path |
|------|--------|------|
| Inbound Webhook | POST | `/voice/inbound` |
| Address Search | POST | `/voice/address-search` |
| Get Quote | POST | `/voice/quote` |
| Booking Lookup | POST | `/voice/booking` (read-only; existing paid bookings) |
| Leave Message | POST | `/voice/message` |
| After Call | POST | `/voice/call-ended` |

Provisional Booking and Send Booking Link are configured in Fonio and enabled on the Worker via `VOICE_ENABLE_BOOKING_TOOLS=1`.

## Prompt

Paste the latest copy from `docs/fonio-receptionist-prompt.md` into the Fonio assistant (Address Search section included). There is no Fonio API to publish prompts remotely — dashboard paste is required.

## Stripe

Quotations include `/book-quote/?id=…`. Send Booking Link is live: ask which UK mobile, then text or WhatsApp, then send. Customer-facing “after payment” line confirms the booking only — no internal driver-assignment policy read-out.

## Speech recognition (Northern Irish accents)

Live Fonio Olivia uses **Deepgram** STT with `en-GB`, expanded NI place `keyTerms`, and high-precision examples for postcodes/flights/mobiles. Prompt asks her to request a repeat when unclear.
