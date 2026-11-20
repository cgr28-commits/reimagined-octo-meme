# /tap UI screenshots (PR #1038)

Captured from the implemented `/tap` page on an iPhone-sized viewport (390×844). No live payment was taken.

| File | Screen |
|------|--------|
| `01-mobile-landing.png` | Full mobile landing |
| `02-tip-amount.png` | Leave a Tip amount selection |
| `02b-tip-confirm-apple-google-note.png` | £5 confirmed — pay CTA + Apple Pay / Google Pay note |
| `03-stripe-payment-preview.png` | Structural preview of shared `/pay/card` Stripe Elements (see note) |
| `04-tip-thank-you.png` | Successful tip thank-you UI |
| `stripe-pay-preview.html` | Source for the structural Stripe preview |

## Apple Pay / Google Pay / Link for anonymous /tap tips

**Yes — available through the existing payment integration**, when the tip Worker routes are deployed and Stripe creates a Checkout Session:

- Anonymous `/tap` tips call the same `createHostedCheckout` path as other tips/bookings (`workers/addresses/src/tap-handlers.ts` → `payment-provider.ts` → Stripe Checkout Session `ui_mode: "elements"`).
- The customer pays on the existing `/pay/card/` page (`StripeCardPayClient.tsx`), which mounts:
  - **Express Checkout** with `applePay: "always"` and `googlePay: "always"`
  - **Payment Element** accordion (Stripe **Link** is not in `STRIPE_EXCLUDED_PAYMENT_METHODS`; excluded are only Amazon Pay, Klarna, Afterpay/Clearpay)
- Wallet buttons appear when the browser/device supports them (Safari/Apple Pay, Chrome/Google Pay, etc.).

**Blocker for a live test-mode Stripe iframe screenshot today:** production Worker does not yet expose `/tap/tip/checkout` (404), and this environment has no Stripe test secret to create a `cs_test_…` session. `03-stripe-payment-preview.png` is therefore a **labelled structural preview** of that shared `/pay/card` layout — not a live Stripe iframe.

## Thank-you screenshot note

`04-tip-thank-you.png` shows the real thank-you copy and layout from `TapPageClient` / `TIP_PAGE_THANKS`. The paid state was forced in the browser for capture because tip settlement cannot run until tip APIs are deployed — no charge was made.
