# My Airport Taxi NI

Next.js site for Northern Ireland airport transfers — WhatsApp booking, quote form, and airport information.

**Live site:** https://www.myairporttaxini.co.uk

**Repository:** https://github.com/cgr28-commits/reimagined-octo-meme

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm install
npm run build
npm start
```

## Stack

- Next.js 15
- React 19
- Tailwind CSS 4
- Cloudflare Worker for address lookup + booking email/calendar

## Google Calendar booking log

Confirmed website bookings are logged to **colinrice876@gmail.com** (or whichever calendar you set in `GOOGLE_CALENDAR_ID`) by the Cloudflare Worker:

- WhatsApp / email bookings via `POST /bookings`
- **SumUp paid bookings** via `POST /payments/confirm` after payment is verified

Each calendar event is branded with **My Airport Taxi NI** in the title, your logo as an attachment, payment status for paid jobs, and full trip details in the description.

1. Enable **Google Calendar API** in Google Cloud.
2. Create a **service account** and download its JSON key.
3. Share **colinrice876@gmail.com** with the service account email (`…@….iam.gserviceaccount.com`) using **Make changes to events**.
4. Set Worker secrets (choose one):

**Option A — GitHub Actions (recommended):** add repository secrets:
- `GOOGLE_CALENDAR_ID` = `colinrice876@gmail.com`
- `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` = full JSON key contents

The deploy workflow syncs these to Cloudflare automatically on each worker deploy.

**Option B — local script:**

```bash
CLOUDFLARE_API_TOKEN=... \
GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE=./service-account.json \
npm run setup:calendar
```

**Verify connection:**

```bash
curl https://reimagined-octo-meme.cgr28.workers.dev/calendar-status
```

Look for `"connected": true`.

Transfer bookings create a 90-minute calendar event at the requested pickup time (`Europe/London`). Return journeys create a second event. Paid SumUp jobs show `[PAID £…]` in the event title. Day-trip enquiries create an 8-hour event from 09:00 on the preferred date.

## Daily automated health check

GitHub Actions runs **every day at 07:00 UTC** (`.github/workflows/daily-health-check.yml`):

- Checks the live website (homepage, terms, privacy, driver, tracking demo, favicon)
- Checks the Cloudflare Worker (calendar, tracking API)
- Runs worker typecheck + site build
- **Auto-fixes** missing sitemap entries and commits if needed
- **Auto-redeploys** the worker if worker API checks fail
- Emails a daily summary via Web3Forms (uses existing `WEB3FORMS_ACCESS_KEY` secret)

Optional: set `HEALTH_CHECK_NOTIFY_EMAIL` in GitHub Actions secrets (e.g. `colinrice876@gmail.com`) to choose where summaries are sent. Default: `bookings@myairporttaxini.co.uk`.

Run manually: `npm run health-check` (set `HEALTH_CHECK_SKIP_BUILD=1` for a quick check without building).
