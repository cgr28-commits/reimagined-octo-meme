# WhatsApp quote assistant (WhatsApp Business Platform)

Customers message your WhatsApp number, the assistant collects the journey details,
confirms them, and replies with a **fixed price and a secure booking link**. The price
comes from the same website pricing engine as the online quote, and the link is a normal
Quick Quote (`/book-quote/?id=…`) where the customer checks the details and pays by SumUp.

You **keep your existing number** and the WhatsApp Business app on your phone when using
Meta *Coexistence*. With 360dialog (current production), the business number
`07549 815538` is hosted on 360dialog's Cloud API.

## Provider selection

| `WHATSAPP_PROVIDER` | Behaviour |
| --- | --- |
| unset (default) | **Legacy:** use 360dialog if `D360_API_KEY` is set, otherwise Meta if all four Meta secrets are set. Production today relies on this with `D360_API_KEY`. |
| `360dialog` | 360dialog only. Missing `D360_API_KEY` → not configured (does **not** fall back to Meta). |
| `meta` | Meta Cloud API only. Incomplete Meta credentials → not configured (does **not** fall back to 360dialog, even if `D360_API_KEY` is present). |

Required Meta credentials when provider is `meta`:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (templates list/create/submit)

Optional: `WHATSAPP_GRAPH_VERSION` (default `v23.0`).

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
  (when `smb_message_echoes` are available), so it never talks over you.
- Groups of more than 4 are passed to you (larger vehicle). Past dates are rejected.
- Quote links last 24 hours. Each customer can create up to 10 quotes per hour.
- Media, voice notes and locations get a polite "please type your journey" reply.

## Setup with 360dialog (current production)

The live business number (`07549 815538`) is on 360dialog.

1. In 360dialog (hub.360dialog.com) finish the signup and API access for the number.
2. In the 360dialog dashboard, generate an **API key** for the number.
3. In Cloudflare → Workers → reimagined-octo-meme → Settings → Variables and Secrets add:
   - `D360_API_KEY` (type **Secret**): the 360dialog API key.
   - Optional: `WHATSAPP_PROVIDER=360dialog` (explicit; recommended once Meta staging exists).
   - `WHATSAPP_TEAM_NUMBER` (type Text): e.g. `447549815538` when handoffs should link elsewhere.
4. Open this address once in your browser:
   `https://reimagined-octo-meme.cgr28.workers.dev/whatsapp/connect`
   It tells 360dialog to send messages to the Worker and sets the WhatsApp business
   profile (about, description, email, website, and the navy logo
   `public/facebook-profile-logo-navy.png`). You should see **Connected ✅**.
5. Message the number from another phone to test.
6. Point the website's WhatsApp buttons at the number (`SITE.whatsapp` in
   `src/lib/data.ts`).

Template status / submit: `GET /whatsapp/templates` and `?submit=1` (via 360dialog).

## Staging with Meta Cloud API (test number only)

Use a **separate** Cloudflare Worker (`wrangler.staging.toml`) with isolated KV and Meta
**test** credentials. Do **not** connect staging to the production number, live webhook,
or production KV. Do **not** register or migrate the live Coexistence number onto staging.

| Resource | Value |
| --- | --- |
| Worker name | `reimagined-octo-meme-whatsapp-staging` |
| Config file | `workers/addresses/wrangler.staging.toml` |
| Setup script | `node scripts/setup-whatsapp-staging.mjs` |
| `[vars].WHATSAPP_PROVIDER` | `meta` |
| KV `TRACKING_STORE` | **new** namespace (never production id) |
| KV `BOOKING_COUNTER` | **new** namespace (never production id) |
| Secrets | Meta **test** only: access token, phone number ID, app secret, verify token, WABA id |
| Do not set | `D360_API_KEY`, production WhatsApp number, production webhooks, production KV |

### Deploy staging (when Cloudflare token + Meta TEST secrets are available)

```bash
cd /path/to/repo
CLOUDFLARE_API_TOKEN=... \
WHATSAPP_ACCESS_TOKEN=... \
WHATSAPP_PHONE_NUMBER_ID=... \
WHATSAPP_APP_SECRET=... \
WHATSAPP_VERIFY_TOKEN=... \
WHATSAPP_BUSINESS_ACCOUNT_ID=... \
# optional: ANTHROPIC_API_KEY=... \
node scripts/setup-whatsapp-staging.mjs
```

The script refuses to run if `D360_API_KEY` is present, refuses production KV ids, and only
deploys `wrangler.staging.toml`.

After deploy:

1. Meta App → WhatsApp → Configuration → Webhook  
   Callback: `https://reimagined-octo-meme-whatsapp-staging.<workers-subdomain>/whatsapp/webhook`  
   Verify token: matches `WHATSAPP_VERIFY_TOKEN`  
   Fields: `messages`, and `smb_message_echoes` if available on the test number.
2. Check `GET /whatsapp/status` and `GET /whatsapp/templates` on the staging Worker.
3. Submit templates with `GET /whatsapp/templates?submit=1` on staging; wait for APPROVED.
4. Message the **Meta test number** only — never `07549 815538`.

Never send staging messages to real customers.

## One-time setup (Meta direct — production cutover later)

You need a Meta Business account (business.facebook.com). **Do not run this against the
live number until cutover is explicitly approved.** Number migration is not an env-var flip
(see Migration procedure below).

1. Ensure the WhatsApp Business Account can be hosted on Meta Cloud API (direct), or
   complete Embedded Signup / Tech Provider onboarding as required for your portfolio.
2. In your Meta app → **WhatsApp → API Setup**, copy the **Phone number ID**.
3. Copy the **WhatsApp Business Account ID** (WABA).
4. Create a **permanent access token**: Business Settings → Users → System users → Admin
   → Assign assets (app + WhatsApp account) → Generate token with
   `whatsapp_business_messaging` and `whatsapp_business_management`.
5. Copy the **App secret** from App settings → Basic.
6. Pick any long random string as the **verify token**.
7. Add Worker secrets/vars (production Worker only at cutover):

   ```bash
   cd workers/addresses
   npx wrangler secret put WHATSAPP_ACCESS_TOKEN
   npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
   npx wrangler secret put WHATSAPP_APP_SECRET
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN
   npx wrangler secret put WHATSAPP_BUSINESS_ACCOUNT_ID
   # plain var:
   # WHATSAPP_PROVIDER=meta
   ```

8. Point Meta webhook at the production Worker `/whatsapp/webhook`, subscribe to
   `messages` and `smb_message_echoes`.
9. Re-submit / confirm all `mat_*` templates are APPROVED on the Meta-hosted WABA before
   enabling customer traffic.

## Controls

| Setting | Where | Effect |
| --- | --- | --- |
| `WHATSAPP_PROVIDER` | Worker var | `360dialog` \| `meta` (see table above). |
| `WHATSAPP_BOT_ENABLED = "false"` | Worker variable | Assistant stops replying; you handle every chat in the app. |
| `WHATSAPP_HANDOFF_HOURS` | Worker variable | How long it stays quiet after AGENT or your reply (default 0.5 h). |
| `WHATSAPP_GRAPH_VERSION` | Worker variable | Graph API version (default `v23.0`). |
| `WHATSAPP_TEAM_NUMBER` | Worker variable | Handoffs link customers to this number instead of pausing the assistant. |
| `WHATSAPP_TEMPLATES_ENABLED = "false"` | Worker variable | Stops all template sends (emails unaffected). |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Worker secret/var | Required for Meta template list/submit. |

Without a resolved provider (`resolveWhatsAppProvider` null), the webhook returns 503 and
nothing else changes on the site.

## Costs and rules

- Free-form replies inside the 24-hour customer service window follow Meta's current
  service-message pricing (including any free allowance). Check Meta's pricing page.
- Business-initiated templates (booking confirmed, reminders, driver status, etc.) are
  charged as utility/marketing per Meta's rate card whether you use 360dialog or Meta
  direct — 360dialog adds a ~€49/number/month platform fee; Meta direct has no BSP fee.
- Template wording stays in My Airport Taxi NI voice ("we", "your driver").

## Migration: 360dialog → Meta Cloud API (live number)

**Critical:** switching `WHATSAPP_PROVIDER` alone does **not** move the phone number.
Once a number leaves 360dialog BSP hosting and is registered on Meta Cloud API, rollback
is limited and may require Meta/360dialog support — it is not a simple env revert.

### Mandatory Coexistence gate (must pass before any live migration)

The live number uses the **WhatsApp Business App with Coexistence** (API + phone app share
the same number; owner replies must continue to appear in the app and pause the assistant
via `smb_message_echoes`).

**Do not migrate** until Meta (and 360dialog if they still host the number) confirm in writing that:

1. Direct Meta Cloud API hosting is available for this WhatsApp Business Account / number.
2. **WhatsApp Business App Coexistence is retained** after leaving 360dialog BSP hosting
   (same number stays linked to the Business App on the phone).
3. `smb_message_echoes` (or equivalent) continues so the assistant steps back when the owner
   replies from the app.
4. Any 360dialog release steps required before Meta can host the number.

If Coexistence cannot be retained on Meta direct hosting, **stop** — do not cut over. Keep
360dialog (or another Coexistence-capable path) until an acceptable arrangement exists.

### Preconditions

1. Staging Meta path proven (inbound, AI reply, quote, templates, statuses) on a **test** number only.
2. Coexistence gate above passed.
3. Meta Business Portfolio owns / can host the WABA.
4. Confirm with 360dialog and Meta the exact release / re-host steps for `+44 7549 815538`.
5. Inventory all APPROVED `mat_*` templates on 360dialog; they must be recreated and
   APPROVED on the destination Meta WABA (names/language `en_GB`/components identical).
6. Maintenance window agreed; owner available to monitor `/whatsapp/status`.

### Cutover outline

1. Freeze non-essential template experiments; keep production on 360dialog.
2. On Meta: create/verify WABA, app, system user token, phone number ID (after number is
   eligible to register — often after BSP release).
3. Submit all `mat_*` templates on Meta; wait until APPROVED.
4. Deploy Worker code that supports `WHATSAPP_PROVIDER=meta` (this codebase) to production
   **while still** `WHATSAPP_PROVIDER` unset or `360dialog` and `D360_API_KEY` active.
5. Coordinate 360dialog **number release / migration** to Meta (account-side). Expect
   possible WhatsApp downtime while the number moves — customers may not receive API
   messages during that window.
6. Immediately set production secrets for Meta, set `WHATSAPP_PROVIDER=meta`, configure
   Meta webhook to production `/whatsapp/webhook`, verify handshake.
7. Smoke-test with a staff phone: inbound → AI/quote → one approved template to the staff
   number only.
8. Keep `D360_API_KEY` retained (unused) until stability is confirmed — do not cancel
   360dialog until explicitly approved.

### Rollback limitations

| Stage | Rollback |
| --- | --- |
| Code deployed, still on 360dialog | Revert Worker deploy or keep provider `360dialog`. |
| Meta secrets added but provider still 360dialog | Remove Meta webhook; no customer impact. |
| Number migrated to Meta + provider=meta | Setting provider back to `360dialog` **only works if** the number is still on 360dialog. After a completed BSP release, you must reverse the number migration with Meta/360dialog — env rollback alone cannot restore API delivery. |

### Downtime / risk

- Brief messaging outage during number host migration is likely.
- Templates pending approval = silent skip of WhatsApp notifications (emails still send).
- Coexistence / `smb_message_echoes` behaviour may differ after migration — re-verify owner
  reply pauses the assistant.
- Dual-send risk if both 360dialog and Meta webhooks remain pointed at production — disable
  the old webhook as soon as Meta is live.

## Code map

- `shared/whatsapp-cloud.ts`: provider resolution, webhook parsing, signature verification, sending + safe HTTP retries.
- `shared/whatsapp-quote-bot.ts`: conversation logic (pure, unit-checked).
- `workers/addresses/src/whatsapp-handlers.ts`: `/whatsapp/webhook` route, KV state, pricing.
- `workers/addresses/src/whatsapp-templates.ts`: template definitions, list/submit/send (360dialog + Meta).
- `workers/addresses/src/whatsapp-ai.ts`: Claude assistant (unchanged behaviour).
- `workers/addresses/wrangler.staging.toml`: Meta staging Worker (deploy only after approval).
- Checks: `npm run check:whatsapp-quote-bot`, `npm run check:whatsapp-templates`,
  `npm run check:whatsapp-meta-cloud`.
