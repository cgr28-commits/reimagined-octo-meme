# Fonio live configuration (quotation + address search)

**Approved for production:** receptionist prompt, Address Search, Get Quote, inbound greeting, Leave Message, After Call.  
**Not enabled yet:** provisional booking, booking-link SMS / WhatsApp payment links (`VOICE_ENABLE_BOOKING_TOOLS` unset on Worker).

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

Do **not** add Provisional Booking or Send Booking Link in Fonio until booking tools are verified and `VOICE_ENABLE_BOOKING_TOOLS=1` is set on the Worker.

## Prompt

Paste the latest copy from `docs/fonio-receptionist-prompt.md` into the Fonio assistant (Address Search section included). There is no Fonio API to publish prompts remotely — dashboard paste is required.

## Stripe

Unchanged: quotations may include `/book-quote/?id=…` in tool JSON for later use, but Send Booking Link stays disabled so the phone line will not push payment SMS until approved.
