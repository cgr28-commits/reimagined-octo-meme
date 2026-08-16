# Resend setup — My Airport Taxi NI

This site sends booking and quote emails with **Resend** from the Cloudflare Worker
(and optionally the Next.js `/api/booking` route in non-static deploys).

FormSubmit has been removed. The browser never posts bookings to a third-party form URL.

## 1. Create a Resend account + API key

1. Sign in at [https://resend.com](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Copy the key (`re_…`) into GitHub Actions secrets / Cloudflare Worker secrets as `RESEND_API_KEY`
4. Never commit the key, never put it in `NEXT_PUBLIC_*` variables

## 2. Add and verify your domain

1. In Resend go to **Domains** → **Add Domain**
2. Enter: `myairporttaxini.co.uk`
3. Resend will show the **exact DNS records** to add (DKIM / SPF / optional DMARC-related CNAMEs or TXT)
4. Copy those values **from the Resend dashboard** into your DNS host for `myairporttaxini.co.uk`
5. Wait until Resend marks the domain as **Verified**

Do **not** invent DKIM/SPF values — they are unique to your Resend domain. Always copy them from Resend.

## 3. Sender address

Preferred From address (configurable):

- `bookings@myairporttaxini.co.uk`
- Display name: `My Airport Taxi NI`

Central defaults live in `shared/email-config.ts`. Override with:

- `BOOKING_FROM_EMAIL`
- `BOOKING_NOTIFICATION_EMAIL` (business inbox for new booking alerts)

Until the domain is verified in Resend, sends will fail or be rejected. The code does **not** pretend the domain is already verified.

## 4. Cloudflare Worker secrets (production)

GitHub → **Settings → Secrets and variables → Actions**:

- `RESEND_API_KEY`
- `BOOKING_FROM_EMAIL` = `bookings@myairporttaxini.co.uk`
- `BOOKING_NOTIFICATION_EMAIL` = your business inbox (e.g. `bookings@myairporttaxini.co.uk`)

`deploy-worker.yml` syncs these to the Worker on deploy. Or run:

```bash
printf '%s' 're_...' | npx wrangler secret put RESEND_API_KEY
printf '%s' 'bookings@myairporttaxini.co.uk' | npx wrangler secret put BOOKING_FROM_EMAIL
printf '%s' 'bookings@myairporttaxini.co.uk' | npx wrangler secret put BOOKING_NOTIFICATION_EMAIL
```

from `workers/addresses` after setting `CLOUDFLARE_API_TOKEN`.

## 5. DMARC / deliverability notes

- Authenticate the domain fully in Resend (SPF + DKIM as shown in the dashboard)
- Keep From = `@myairporttaxini.co.uk` (aligned with SPF/DKIM)
- Business notifications set **Reply-To** to the customer’s email (From stays `bookings@…`)
- Avoid putting the customer address in From (SPF/DMARC failures)

## 6. How to send a test booking

1. Complete domain verification in Resend
2. Deploy the Worker with `RESEND_API_KEY` set
3. On the live site, complete a booking request with your own email
4. Confirm:
   - Customer receives **Booking Request Received** (request, not confirmed)
   - Business inbox receives **New Booking Request**
   - Reply on the business email goes to the customer (Reply-To)

Local HTML/text preview without sending:

```bash
npx tsx scripts/check-resend-booking-emails.ts
```

Live send (optional, needs `RESEND_API_KEY`):

```bash
RESEND_API_KEY=re_... TEST_EMAIL_TO=you@example.com npx tsx scripts/send-driver-details-test-emails.ts
```
