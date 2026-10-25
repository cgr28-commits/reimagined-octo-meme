# WhatsApp quote assistant (WhatsApp Business Platform)

Customers message your WhatsApp number, the assistant collects the journey details,
confirms them, and replies with a **fixed price and a secure booking link**. The price
comes from the same website pricing engine as the online quote, and the link is a normal
Quick Quote (`/book-quote/?id=…`) where the customer checks the details and pays by SumUp.

You **keep your existing number** and the WhatsApp Business app on your phone. This uses
Meta's *Coexistence* onboarding: the app and the API share the number, so every chat
(including the assistant's replies) still appears in the app.

## How the conversation works

```
Customer:  How much from BT9 6AA to Belfast International Friday 5am, 2 people 2 bags, one way
Assistant: Thanks! Here's your journey: … Reply YES to get your fixed price, or tell me what to change.
Customer:  yes
Assistant: Your fixed price is £45 ✅  To book, check your details and pay securely here: https://www.myairporttaxini.co.uk/book-quote/?id=…
```

- Tap buttons: **✅ Yes, get price / 🆕 New quote** on the summary, **➡️ One way /
  🔁 Return** when asking about the journey type, and **🆕 New quote** after a price.
  Typing still works everywhere. "Speak to team" is not offered; typing AGENT still
  hands off quietly.
- Missing details are asked for one at a time (pickup, destination, date, time, passengers,
  suitcases, one way/return, return date/time).
- Customers can correct anything ("3 passengers", "make it a return on 20/11 at 9pm").
- **NEW** starts again. **AGENT** hands the chat to you, and the assistant stays quiet for
  that customer for 12 hours.
- **When you reply from the WhatsApp Business app, the assistant stops for that customer**
  (12 hours by default), so it never talks over you.
- Groups of more than 4 are passed to you (larger vehicle). Past dates are rejected.
- Quote links last 24 hours. Each customer can create up to 10 quotes per hour.
- Media, voice notes and locations get a polite "please type your journey" reply.

## Setup with 360dialog (virtual number)

This is the simplest route. The assistant gets its own WhatsApp number (a virtual
number from Meta via 360dialog). Your existing number stays on your phone, untouched.

1. In 360dialog (hub.360dialog.com) finish the signup and choose **"Use a display name
   with a virtual number instead"**.
2. In the 360dialog dashboard, generate an **API key** for the number.
3. In Cloudflare → Workers → reimagined-octo-meme → Settings → Variables and Secrets add:
   - `D360_API_KEY` (type **Secret**): the 360dialog API key.
   - `WHATSAPP_TEAM_NUMBER` (type Text): your own WhatsApp number, e.g. `447549815538`.
     When a customer replies AGENT (or needs a larger vehicle) the assistant sends them
     a link to chat with this number, with their journey details pre-filled.
4. Open this address once in your browser:
   `https://reimagined-octo-meme.cgr28.workers.dev/whatsapp/connect`
   It tells 360dialog to send messages to the Worker and sets the WhatsApp business
   profile (about, description, email, website, and the navy logo
   `public/facebook-profile-logo-navy.png`). You should see **Connected ✅**.
   Open it again any time to re-apply the profile (60-second cooldown).
5. Message the new number from another phone to test.
6. Point the website's WhatsApp buttons at the new number (`SITE.whatsapp` in
   `src/lib/data.ts`).

The owner also gets an email whenever a customer asks to speak to the team. 360dialog
mode needs no Meta access token, app secret or verify token. The webhook is protected
by a secret header derived from the API key.

## One-time setup (Meta direct, Coexistence)

You need a Meta Business account (business.facebook.com) and about 30 minutes.

1. **Connect your existing number with Coexistence.** Onboarding an *existing* WhatsApp
   Business app number goes through Meta's Embedded Signup. That means a Meta Tech
   Provider / Business Solution Provider (for example 360dialog, Twilio or Infobip), or
   your own Meta app registered as a Tech Provider. Choose the option to **connect your
   existing WhatsApp Business app** (not "new number"), enter your number and confirm the
   code in the app.
   Requirements: WhatsApp Business app **v2.24.17 or newer**, your country code on Meta's
   supported list (check +44 when you sign up), and the app used on the phone regularly.
   Linked companion devices are unlinked during onboarding; re-link them afterwards.
   **Do not** register the number through "Add phone number" in WhatsApp Manager. That
   path moves the number off the app.
2. In your Meta app → **WhatsApp → API Setup**, copy the **Phone number ID** (a long
   number, not your phone number).
3. Create a **permanent access token**: Business Settings → Users → System users → add
   one (Admin) → Assign assets (your app and WhatsApp account) → Generate token with
   `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Copy the **App secret** from App settings → Basic.
5. Pick any long random string as the **verify token**.
6. Add the four Worker secrets:

   ```bash
   cd workers/addresses
   npx wrangler secret put WHATSAPP_ACCESS_TOKEN
   npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
   npx wrangler secret put WHATSAPP_APP_SECRET
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN
   ```

   (or Cloudflare dashboard → Workers → reimagined-octo-meme → Settings → Variables and Secrets).
7. Deploy the Worker, then in the Meta app → **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://reimagined-octo-meme.cgr28.workers.dev/whatsapp/webhook`
   - Verify token: the string from step 5
   - Subscribe to the **messages** and **smb_message_echoes** fields.
     (`smb_message_echoes` is what lets the assistant step back when you reply from the app.)
8. Send your number a test message from another phone.

If you onboard through a provider that hosts the webhook for you, set its forwarding URL
to the callback URL above. The Worker verifies Meta's `X-Hub-Signature-256` with your App
secret, so the provider must forward Meta's original body and signature.

## Controls

| Setting | Where | Effect |
| --- | --- | --- |
| `WHATSAPP_BOT_ENABLED = "false"` | Worker variable | Assistant stops replying; you handle every chat in the app. |
| `WHATSAPP_HANDOFF_HOURS` | Worker variable | How long it stays quiet after AGENT or your reply (default 12). |
| `WHATSAPP_GRAPH_VERSION` | Worker variable | Graph API version (default `v23.0`). |
| `WHATSAPP_TEAM_NUMBER` | Worker variable | Handoffs link customers to this number instead of pausing the assistant. |

Without either `D360_API_KEY` or the four Meta secrets, the webhook returns 503 and
nothing else changes on the site.

## Costs and rules

- Replies to a customer who messaged you (within 24 hours) are free-form *service*
  messages. Meta does not charge for service conversations at the time of writing; check
  Meta's current pricing page. Messages you type in the app stay free.
- The assistant only ever replies to customers who message first, so no message templates
  or marketing opt-ins are needed.
- Blue-tick (Official Business Account) verification is not available on Coexistence numbers.

## Code map

- `shared/whatsapp-cloud.ts`: webhook parsing, signature verification, sending.
- `shared/whatsapp-quote-bot.ts`: conversation logic (pure, unit-checked).
- `workers/addresses/src/whatsapp-handlers.ts`: `/whatsapp/webhook` route, KV state, pricing.
- `createPricedQuickQuote` in `workers/addresses/src/quick-quote-handlers.ts`: shared
  with the owner Quick Quote tool.
- Checks: `npm run check:whatsapp-quote-bot`.
