# Private preview: owner guide

The preview is a **private test copy** of the Belfast events hub and the Event / Business Class request service.
- It runs in your separate **"My Airport Taxi NI Staging"** Cloudflare account, with its own storage.
- It cannot take real money, email real customers or your bookings mailbox, or touch live bookings.
- The live website, live Worker and live storage are not involved. Migration v6 is not applied to live.

It is deployed automatically from the development branch by the GitHub workflow
**Deploy Bespoke Preview (isolated account)**. You do not need to run any commands.

**Never paste a secret key into chat, email, a commit or a document.** Keys go only into
GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**.

## What works straight away (no set-up)
- The private preview website, opened with your private link.
- Both request forms, with real Google address suggestions and the Design 3 date and time pickers.
- Sending a request and getting a reference number.

Preview emails are **blocked** until you add a tester inbox (below), and the Owner Dashboard on the
preview cannot be signed in to until you add a preview owner key (below).

## Optional secrets (add any you want, then re-run the workflow)
| GitHub secret name | What it does | Value |
|---|---|---|
| `BESPOKE_PREVIEW_OWNER_KEY` | Lets you sign in to the preview Owner Dashboard to see requests, send quotations and approve events | A **new** password of 24+ characters. Not your live owner key (the deploy refuses the live key). |
| `BESPOKE_PREVIEW_TESTER_EMAIL` | The only inbox preview emails may go to | An address you can read. Not `bookings@myairporttaxini.co.uk`. |
| `BESPOKE_PREVIEW_RESEND_API_KEY` | Sends real test emails to the tester inbox | A separate Resend key with **Sending access** only |
| `BESPOKE_PREVIEW_STRIPE_SECRET_KEY` | Test payments | Stripe **Test mode** secret key (`sk_test_…`). Live keys are refused. |
| `BESPOKE_PREVIEW_STRIPE_PUBLISHABLE_KEY` | Test payments | `pk_test_…` |
| `BESPOKE_PREVIEW_STRIPE_WEBHOOK_SECRET` | Test payment confirmations | Signing secret (`whsec_…`) of a **Test mode** webhook endpoint (see below) |

To re-run: GitHub → **Actions** → **Deploy Bespoke Preview (isolated account)** → open the latest run → **Re-run all jobs**.

### Stripe test webhook (only if you want to test payments)
In Stripe **Test mode** → Developers → Webhooks → Add endpoint:
- URL: the preview Worker address shown in the workflow run, followed by `/payments/stripe-webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`

## Things to know
- **Private link:** the website only opens through your private link. The link sets a cookie on that
  browser for 30 days. Open quotation emails in the same browser (Safari on your iPhone).
- **Bot check:** the preview uses Cloudflare's always-pass test widget, so it shows "Success" without a challenge. The live site will need a real Turnstile widget before launch.
- **Address suggestions** use your existing Google Places key, stored as a secret on the preview Worker.
- **To remove the preview:** delete the Worker `reimagined-octo-meme-bespoke-preview`, the Pages project
  `matni-bespoke-preview` and the two KV namespaces named `matni-bespoke-preview-…` in the Staging account.

## Going live is separate
Nothing here switches the new pages on for the public. That needs your explicit approval:
both switches on, a live Worker deploy (which applies migration v6) and a real Turnstile widget.
