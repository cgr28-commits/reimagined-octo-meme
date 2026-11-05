# Fonio live configuration (quotation + address search)

**Live on Fonio (Olivia):** approved receptionist prompt, Inbound Webhook, Address Search, Get Quote (with Place IDs), Booking Lookup, Booking Link, Send Booking Link, Leave Message, Provisional Booking, After Call.  
**Worker:** `VOICE_ENABLE_BOOKING_TOOLS=1` in production Worker vars so Send Booking Link / Provisional Booking are live (WhatsApp first; SMS fallback via Fonio Send SMS when returned).

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

Unchanged: quotations may include `/book-quote/?id=…` in tool JSON for later use, but Send Booking Link stays disabled so the phone line will not push payment SMS until approved.

## Speech recognition (Northern Irish accents)

Live Fonio Olivia uses **Deepgram** STT with `en-GB`, expanded NI place `keyTerms`, and high-precision examples for postcodes/flights/mobiles. Prompt asks her to request a repeat when unclear.
