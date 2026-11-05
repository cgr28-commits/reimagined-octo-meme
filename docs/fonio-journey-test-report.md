# Fonio telephone journey — test report

_Generated locally by scripts/check-voice-journey.ts. No live Fonio or Stripe calls._

## Tested in this environment
- Inbound greeting: Europe/London day-part + full name once (unit + source)
- Get Quote ok=false (missing dropoff): no fare in say; askNext only
- Get Quote ok=true spoken fare uses backend amount only (shared say builder)
- Worker Get Quote reuses availability + createPricedQuickQuote; ok=false paths present
- Send Booking Link: generated vs accepted wording; no driver-assigned-after-pay promise
- Stripe Checkout + /book-quote → /payments wiring present in Worker source
- Booking Lookup: confirms only when reference + mobile verify against backend
- Review prompt documents SMS statuses, ok=false, greeting once, no driver-after-pay

## Still requires live Fonio or Stripe testing
- Fonio inbound webhook against production Worker with VOICE_WEBHOOK_SECRET
- Live Fonio call: spoken greeting once + natural quote/booking dialogue
- Fonio Send SMS add-on accepting smsText (messageStatus=generated → accepted)
- WhatsApp Cloud template delivery receipt (messageStatus=delivered if/when available)
- Caller opens /book-quote link and completes Stripe Checkout
- Stripe webhook / payment confirm marks booking paid; Booking Lookup reports verified status
- Paste updated prompt + tool config into live Fonio assistant (approval-gated)

## Preservation checks
- Stripe Checkout integration left as existing `/book-quote` → `/payments` path.
- Pricing still via `createPricedQuickQuote` + shared quote rules.
- Provisional bookings remain `awaiting_payment` (never auto-paid).
- No live Fonio dashboard deploy performed.
