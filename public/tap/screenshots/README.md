# /tap mobile screenshots (visual quality)

Captured from the implemented `/tap` page under Chromium device metrics (not Safari on a physical iPhone). No live payment was taken.

## Landing (multi-width)

| File | Viewport |
|------|----------|
| `01-mobile-landing-320.png` | 320×720 |
| `01-mobile-landing-375.png` | 375×812 |
| `01-mobile-landing-390.png` | 390×844 (also copied to `01-mobile-landing.png`) |
| `01-mobile-landing-393.png` | 393×852 |
| `01-mobile-landing-430.png` | 430×932 |

## Tip

| File | Screen |
|------|--------|
| `02-tip-amount.png` | Leave a Tip amount selection @ 390×844 |

## Verified in capture environment

- Action labels navy `#071C38` with matching `-webkit-text-fill-color` on white buttons
- Emerald Lucide icons
- Two-line intro: “We hope you enjoyed your journey.” / “We’d love to see you again.”
- White Cormorant heading with balanced wrap

**Limitation:** Safari on a real iPhone was not available in this environment. The invisible-label root cause (`-webkit-text-fill-color` inheritance) is WebKit-specific and is fixed in CSS; please confirm on device before merge.
