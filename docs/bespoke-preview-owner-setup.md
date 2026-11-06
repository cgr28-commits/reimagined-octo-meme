# Preview set-up: owner guide

This sets up a **private test copy** of the Event / Business Class booking system.
- It cannot take real money.
- It cannot email real customers or your bookings mailbox.
- It cannot touch your live bookings.

Nothing is deployed until you approve Phase 4B.

**Never paste a secret key into chat, email, a commit or a document.** Keys are typed only into Cloudflare's own prompts (`wrangler secret put …`), which hide them.

Steps marked **MANDATORY** are needed for the preview. **Optional** steps can be skipped.

---

## 1. Create the two preview storage areas (KV): MANDATORY
1. On your computer, in the repository folder `workers/addresses`, run `npx wrangler login` and sign in to your Cloudflare account.
2. Run:
   ```bash
   npx wrangler kv namespace create BESPOKE_PREVIEW_TRACKING_STORE --config wrangler.bespoke-preview.toml
   npx wrangler kv namespace create BESPOKE_PREVIEW_BOOKING_COUNTER --config wrangler.bespoke-preview.toml
   ```
3. Each command prints an `id`. These ids are **not secret**. Send them to me, or paste them into `wrangler.bespoke-preview.toml` in place of the two `REPLACE_WITH_BESPOKE_PREVIEW_…` placeholders.
4. I will then run the safety test that proves no production id was used.

## 2. Create the private preview website: MANDATORY
1. Run (from the repository root): `npx wrangler pages project create matni-bespoke-preview --production-branch=preview`
2. If Cloudflare says the name is taken, tell me the name you chose. Three settings must then change together.

## 3. Make the preview website private (Cloudflare Access): MANDATORY
Cloudflare's "Enable access policy" switch alone protects only the extra preview copies, **not** the main `matni-bespoke-preview.pages.dev` address. Follow Cloudflare's documented steps:
1. Cloudflare dashboard → **Workers & Pages** → `matni-bespoke-preview` → **Settings** → **Enable access policy**.
2. Select **Manage** on the Access policy it created.
3. Under **Access → Applications**, select the project → **Configure**.
4. Under **Public hostname**, in the **Subdomain** field, **delete the `*`** → **Save**.
5. Go back to the Pages project → **Settings → General** → **Enable access policy** again.
6. Check there are now **two** Access policies: one for `matni-bespoke-preview.pages.dev`, one for preview copies.
7. In each policy, allow only your tester email address(es).
8. Test: open `https://matni-bespoke-preview.pages.dev` in a private browser window. You should see a Cloudflare login page, not the site.

(The test Worker itself stays reachable on the internet, because Stripe must be able to send it payment notifications. It protects itself: test-mode Stripe only, emails only to your testers, owner pages need a preview-only key, no live data. Step 9 adds bot protection.)

## 4. Stripe TEST mode: MANDATORY
1. Stripe Dashboard → switch **Test mode** on (top right).
2. **Developers → API keys**: you will need the test **publishable key** (`pk_test_…`) and test **secret key** (`sk_test_…`).
   - Don't copy them anywhere yet; you'll type them into Cloudflare's prompt in Phase 4B.
   - Never use a key that starts `sk_live_` or `pk_live_`: the preview refuses to run with live keys.
3. **Developers → Webhooks → Add endpoint** (still in test mode):
   - Endpoint URL: `https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev/payments/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - Save, then note that a **signing secret** (`whsec_…`) exists. You'll type it into Cloudflare's prompt in Phase 4B.

## 5. Tester inbox(es): MANDATORY
1. Choose 1–3 email addresses you can read. Not `bookings@myairporttaxini.co.uk`, and not a customer's.
2. Tell me the address(es). They are not secret. I'll put them in the six "tester" settings. The preview will **block every email** addressed to anyone else.

## 6. Owner key for the preview: MANDATORY
Think of a new, long password for the preview Owner Dashboard (different from your live one). In Phase 4B you'll type it into the `OWNER_ACCESS_KEY` prompt.

## 7. Separate Google test calendar: optional (recommended)
1. In Google Calendar, create a **new** calendar called "MATNI preview tests". Never use your live calendar.
2. In Google Cloud Console, create a **new** service account just for the preview and create a JSON key for it. Do **not** reuse the live one: the live account could reach the live calendar if a setting were mistyped.
3. In the new calendar's settings → **Share with specific people**, add the service account's email with **Make changes to events**.
4. Note the calendar's **Calendar ID** (Settings → Integrate calendar). In Phase 4B you'll enter the ID and paste the JSON key into Cloudflare's prompts.

Without this step, bookings simply aren't added to a calendar on the preview.

## 8. Test email sending: optional
For real test emails, create a **separate** Resend API key with **Sending access** only (Resend → API keys). You'll type it into Cloudflare's prompt in Phase 4B. Without it, emails show as "failed" on the preview, which is fine.

## 9. Bot protection for the preview: optional (recommended)
Cloudflare Turnstile is free. Create a widget for hostname `matni-bespoke-preview.pages.dev` (Cloudflare dashboard → Turnstile → Add widget, Managed mode). Without it, the preview uses Cloudflare's always-pass test keys, so anyone who finds the test Worker could submit test requests. That would be harmless, but untidy.

## 10. Check Cloudflare builds: MANDATORY (2 minutes)
Cloudflare dashboard → **Workers & Pages** → `reimagined-octo-meme` → **Settings → Builds**:
- Confirm the production branch is `main`.
- Tell me whether **non-production branch builds** are switched on. If they are, pushes to the development branch may have uploaded preview *versions* of the live Worker. Those versions are not live, but we should know.

---

When steps 1–6 and 10 are done (plus any optional ones you want), tell me. I'll prepare the exact Phase 4B commands for your approval.
