# Retell voice quote integration

The Contact page includes a short explanation and the Retell voice widget appears as a floating **Get a taxi price** button across the site. It remains hidden until both public widget settings are configured as GitHub Actions repository variables.

## Website widget

Add these under GitHub Settings → Secrets and variables → Actions → Variables:

- `RETELL_VOICE_PUBLIC_KEY`: the Retell public key for browser voice calls
- `RETELL_VOICE_AGENT_ID`: the Retell voice agent ID

These are public widget values. Never put a Retell private API key in the site or in a `NEXT_PUBLIC_*` variable. Restrict the Retell public key to `www.myairporttaxini.co.uk` (and the apex domain only if it serves the site). The widget uses Retell's supported `retell-widget-v2.js` script and voice-only attributes. The assistant appears only after both values are set and the site is deployed.

## Retell agent

The workspace agent is **My Airport Taxi NI - Booking Requests**. Its selected voice is **Maren (British, young)** with **English (UK)** language settings and expressive mode enabled.

The agent instructions tell it to gather trip details, call the live quote function, read the returned `say` text, and never guess fares. It does not ask for a caller's contact details just to provide a fare. It does not claim that a quote is a confirmed booking.

## Live quote function

The existing Cloudflare Worker endpoint uses the same live fare calculator as the website:

`POST https://reimagined-octo-meme.cgr28.workers.dev/voice/quote`

Retell custom function configuration:

- Name: `get_fixed_price_quote`
- Method: `POST`
- Timeout: 30 seconds
- Input JSON fields:
  - `pickup`, `dropoff`
  - `date` (YYYY-MM-DD), `time` (HH:MM)
  - `passengers`, `suitcases`
  - `returnJourney`; for returns, `returnDate` and `returnTime`
  - optional `flightNumber`
- Map response `say` to `quote_say` and `price` to `quote_price`.

The Worker validates journey details and returns the speakable fare or fallback guidance. The agent must use that response and never calculate or estimate prices itself.

## Phone replacement

The website widget enables browser voice calls. To handle existing telephone calls, connect an inbound phone number or supported SIP route to this same Retell agent, then test calls and quotes. Keep Fonio forwarding active until the voice, fare results, and call handling are verified. Do not purchase a new number or change existing phone routing as part of this website setup.
