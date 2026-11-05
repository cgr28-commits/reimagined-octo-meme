# Fonio live activation report — My Airport Taxi NI

_Europe/London: 5 Nov 2026, ~01:30 UTC / 01:30 GMT_

## Verdict

**Production Worker is live for receptionist quotation + Google Places address search.**  
Genuine fixed-price quotes work. Provisional booking and payment-link SMS stay **disabled**.  
A real telephone call still needs the Fonio dashboard tools/prompt wired to this Worker (no Fonio config API from this agent).

## Deploy

| Item | Result |
|------|--------|
| Code on `main` | `67d08740` (voice tools + address-search + booking gates) |
| Deploy Cloudflare Worker | **SUCCESS** — [run 41948103119](https://github.com/cgr28-commits/reimagined-octo-meme/actions/runs/41948103119) |
| Other CI (postcode-review, booking-funnel, etc.) | Failed / unrelated visual reviews — did not block Worker |

## Production route probe

Base: `https://reimagined-octo-meme.cgr28.workers.dev`

| Endpoint | HTTP | Notes |
|----------|------|-------|
| `/voice/inbound` | 200 | Europe/London greeting, name once |
| `/voice/address-search` | 200 | Google configured |
| `/voice/quote` | 200 | Real pricing engine |
| `/voice/message` | 200 | Leave message |
| `/voice/booking` | 200 | Lookup only |
| `/voice/call-ended` | 200 | Call log |
| `/voice/provisional-booking` | 200 | `bookingToolsDisabled: true` |
| `/voice/send-link` | 200 | `bookingToolsDisabled: true` |
| `/owner/voice-calls` | 401 without owner key | Present (auth required) |

## Live HTTP test (simulates Fonio tool calls — no phone, no payment)

1. **Address — “Hilton in Belfast”** → `clarify` with Hilton Belfast (Lanyon Place), Hampton by Hilton, DoubleTree Templepatrick. `googleConfigured: true`.
2. **Confirm Hilton placeId** → `confirmed` with coords `54.5966, -5.9190`, formatted `4 Lanyon Pl, Belfast BT1 3LP`, say: “No problem. And where are we taking you?”
3. **Incomplete quote** → askNext `date`: “What date do you need the car?” (no fare invented).
4. **Full quote** Hilton → Belfast International (place IDs) → **`ok: true`, £45**, quoteId issued, `/book-quote/?id=…` link in JSON (not SMS’d — send-link gated). Spoken `say` includes cancellation policy and “quotation until you pay”.
5. **Provisional + send-link** → refused with booking-tools-disabled say (as approved).

## Security / keys

| Check | Status |
|-------|--------|
| `GOOGLE_PLACES_API_KEY` on Worker | **Working** (live address search returned Google places) |
| Stripe Checkout path | Unchanged `/book-quote` → `/payments` (link present on quote; SMS not sent) |
| `VOICE_ENABLE_BOOKING_TOOLS` | **Unset** — provisional + send-link blocked |
| `VOICE_WEBHOOK_SECRET` | **Not enforcing** — wrong Bearer still returns 200. Set the GitHub Actions / Worker secret and configure Fonio `Authorization: Bearer …` before public phone routing |
| Fonio prompt published | **NOT VERIFIED** — no assistant config API; paste `docs/fonio-receptionist-prompt.md` in the Fonio dashboard |

## Fonio dashboard — configure now

See `docs/fonio-live-config.md`. Enable only:

- Inbound → `POST …/voice/inbound`
- Address Search → `POST …/voice/address-search`
- Get Quote → `POST …/voice/quote`
- Booking Lookup → `POST …/voice/booking`
- Leave Message → `POST …/voice/message`
- After Call → `POST …/voice/call-ended`

**Do not** enable Provisional Booking or Send Booking Link until you approve `VOICE_ENABLE_BOOKING_TOOLS=1`.

## Remaining issues

1. Paste / confirm the latest prompt inside Fonio (cannot be done from this agent).
2. Wire the six HTTP tools above to the production Worker URL.
3. Set `VOICE_WEBHOOK_SECRET` and matching Fonio Bearer header before opening the live NI number publicly.
4. Optional polish: “Belfast International” currently clarifies among airport vs Park & Fly — catalogue boost could make airport a single confirm.
5. Real handset test call after dashboard paste (this run used HTTP tool simulation only — no `FONIO_API_KEY` for outbound dial).
6. Booking-link SMS / provisional hold — intentionally off until separate approval.

## What was not enabled (per approval)

- Live provisional booking creation  
- Payment / booking-link SMS  
- Confirming paid bookings from the phone line beyond read-only lookup  
