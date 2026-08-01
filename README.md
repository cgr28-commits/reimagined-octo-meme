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

Confirmed website bookings (desktop email and mobile WhatsApp) are logged to your Google Calendar by the Cloudflare Worker at `POST /bookings`.

1. Enable **Google Calendar API** in Google Cloud.
2. Create a **service account** and download its JSON key.
3. Share your Google Calendar with the service account email (`…@….iam.gserviceaccount.com`) using **Make changes to events**.
4. Set Worker secrets:

```bash
cd workers/addresses
npx wrangler secret put GOOGLE_CALENDAR_ID
npx wrangler secret put GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON
```

`GOOGLE_CALENDAR_ID` is usually your Gmail address. Paste the full service account JSON when prompted for `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`.

Transfer bookings create a 90-minute calendar event at the requested pickup time (`Europe/London`). Return journeys create a second event. Day-trip enquiries create an 8-hour event from 09:00 on the preferred date.
