# Retell Irish English voice quote integration

This site is exported to GitHub Pages. The contact-page voice panel is optional and stays hidden unless both Retell widget values are configured at build time.

## Website widget settings

Add these as GitHub Actions **repository variables** (Settings → Secrets and variables → Actions → Variables):

- `RETELL_VOICE_PUBLIC_KEY`: Retell public key for browser voice calls
- `RETELL_VOICE_AGENT_ID`: Retell voice agent ID

These values are public by design. Never put a Retell API secret in a `NEXT_PUBLIC_*` variable or in the repository. The production Pages workflow passes the public values into the static build. The voice panel will then appear on `/contact/`.

In Retell, restrict the public key to `www.myairporttaxini.co.uk` (and the apex domain if it serves the site). Choose an English voice with an Irish accent and preview it before publishing. The site does not set the spoken voice; that is configured on the Retell agent.

## Live fare function

The Cloudflare Worker already exposes the same live quote logic used by the website:

`POST https://reimagined-octo-meme.cgr28.workers.dev/voice/quote`

Configure a Retell custom function to POST a JSON body with:

- `pickup`, `dropoff`
- `date` as YYYY-MM-DD and `time` as HH:MM
- `passengers`, `suitcases`
- `returnJourney`; for returns also `returnDate` and `returnTime`
- optional `flightNumber`

The Worker validates the trip, checks availability, and calculates the fare through the website's current pricing engine. It returns a speakable `say` field and a `price`/booking link on success. In the agent instructions, tell it to use the returned `say` text for the price and fallback response. It must not calculate, estimate, or invent fares itself. Ask one question at a time and call the function only after collecting the required trip details.

Optional booking-link function:

`POST https://reimagined-octo-meme.cgr28.workers.dev/voice/send-link`

Pass `quoteId`, the caller's `name`, and their UK mobile number as `mobile`. Ask the caller whether they want the link sent before calling this function.

## Replacing Fonio for phone calls

The contact-page widget handles browser voice calls. To use the same Retell agent for incoming telephone calls, first connect a Retell phone number or supported SIP route, assign this voice agent to inbound calls, and test several real quote examples. Keep Fonio forwarding active during testing. Switch the business number only after the new route has been verified and the chosen Irish English voice sounds right on a phone call.

Do not place Retell private API keys in the website. Retell public widget keys are restricted to the website domain; phone function calls use the Worker endpoints above.
