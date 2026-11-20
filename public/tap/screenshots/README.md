# /tap mobile screenshots (contrast refresh)

Captured from the implemented `/tap` page on an iPhone-sized viewport (390×844 @3x). No live payment was taken.

| File | Screen |
|------|--------|
| `01-mobile-landing.png` | Full mobile landing — white Cormorant heading, `#D1D5DB` subcopy, Lucide icons, no duplicate brand under logo |
| `02-tip-amount.png` | Leave a Tip amount selection (dark tip card preserved under mobile Design 3) |
| `02b-tip-confirm-apple-google-note.png` | £5 confirmed — pay CTA + Apple Pay / Google Pay note (unchanged flow) |
| `03-stripe-payment-preview.png` | Structural preview of shared `/pay/card` Stripe Elements |
| `04-tip-thank-you.png` | Successful tip thank-you UI |
| `stripe-pay-preview.html` | Source for the structural Stripe preview |

## Contrast (WCAG AA) on `#090B10`

Measured on iPhone emulation with `html[data-mobile-light]` + `data-mobile-d3` active (same as live mobile):

| Element | Colour | Contrast |
|---------|--------|----------|
| Heading | `#FFFFFF` Cormorant | ~19.7:1 |
| Subhead / support | `#D1D5DB` | ~13.4:1 |
| Footer brand | `#9CA3AF` | ~7.8:1 |

Root cause of the “invisible” heading on iPhone: mobile Design 3 forced navy headings and a light `main` background. `/tap` is now excluded from those rules and treated as a dark island.
