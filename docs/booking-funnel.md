# Immediate booking alerts and operational funnel

When an instant-quote customer uses the green booking CTA to advance into booking, the frontend posts `booking_started` to the existing `/quote-leads` endpoint without awaiting it. The Worker sends an immediate owner operational email using the existing provider and configured owner inbox. This is additional to the existing quote-view and explicitly submitted-contact notifications.

The alert contains the route, vehicle, displayed fare, passenger/luggage counts, available outbound/return schedule and random quote tracking reference. It identifies an unconfirmed attempt, never a confirmed booking. It does not contain name, email or mobile number. No customer follow-up or marketing subscription is created.

## Stages and dashboard

Owner → More → Enquiries → Customer booking journey. Select a London quote date and refresh to see the cohort's progress. Each stage counts once per quote session, not per person:

- Quote received: existing quote-session records.
- Booking started: green booking CTA successfully advances to booking.
- Contact stage opened: focus enters the contact section (or the existing explicit details transition).
- Details submitted: existing explicit valid-contact submission action, never keystrokes.
- SumUp opened: customer is handed to the hosted checkout, not merely when a checkout is created.
- Payment confirmed: written only by the server's paid-checkout finalizer. Enquiry references and booking requests do not count as payments.

Separate event keys prevent later-arriving events from overwriting paid status. Possible abandonment means no further recorded stage for ten minutes; it is not proof that the customer has left and does not trigger an email. The dashboard currently shows up to 100 quote-session markers per selected day, explicitly labelled as a sample if more exist. Historical sessions have no retroactive click data. Browser/network blocking and KV eventual consistency can produce missing or delayed stages; these are operational indicators, not an exact count of people.

## Infrastructure and retention

Reuses `TRACKING_STORE`, `QUOTE_LEAD_COORDINATOR` and the existing owner email configuration. No binding, schema or Durable Object migration is required. Existing deployment workflows publish frontend and Worker after an approved merge. Do not manually deploy for this PR.

New public stage requests require the existing coordinator, use an atomic per-network limit of 60 events per hour, and validate bounded journey inputs. The network address is hashed for the limiter identity. Stage keys and booking-email claims expire after 60 days. Dashboard data requires existing owner authorization and is returned with `Cache-Control: no-store`.

Email claims are atomic across concurrent requests. Failed or thrown sends release their claim, allowing a later explicit click to retry; successful sends suppress repeat alerts for that quote. The browser deduplicates successful stages and in-flight requests and uses keepalive for navigation. There is no background guaranteed-delivery queue. Existing emails already delivered to the owner follow mailbox retention, rather than KV expiry.

## Validation

- Frontend TypeScript and lint passed (existing repository warnings).
- Production static export and Worker typecheck/dry-run build passed.
- New tests cover concurrent email deduplication, retries, no contact details, independent stage keys, paid-vs-request distinction, owner authorization, retention, capped reporting and rate limiting.
- Mocked browser checks passed at 320, 360, 375, 390 and 1440px. They verify immediate click events, same-session deduplication, retry after a simulated failure without blocking booking, contact-focus events and no contact submission on typing.
- Owner dashboard checked at 320 and 1440px; screenshots use fictional fixture journeys. CI uploads screenshots as `booking-funnel-screenshots`.
- Daily quote report, quote stats, authoritative fares, SumUp conversion, child-seat/SumUp and Save My Quote regression suites passed.
- The pre-existing quote-email regression expected Dublin Airport → Coalisland to be rejected, despite the current Northern Ireland pickup eligibility. Confirmed against the original module from `050d4de3`, then corrected only the test expectation. The complete quote-email suite now passes; pricing and notification implementations are unchanged.

No live email delivery or real payment was performed. Existing production credentials are reused; live inbox delivery remains a post-approval verification.

## CI dashboard failure correction

The original Booking funnel review workflow compiled the frontend without `NEXT_PUBLIC_BOOKINGS_API_URL`. Unlike the quote form, the owner booking API client intentionally rejects missing configuration before calling fetch. Authentication succeeded and the panel mounted, but no `/quote-stats` request reached Playwright's fixture, so the abandonment label could never appear. Production's deploy workflow supplies this URL; the original local validation also supplied a localhost URL.

Reproduced the original line-69 timeout locally with an explicitly empty build-time URL. The review workflow now supplies `https://booking-funnel.test/bookings` and its address counterpart; all service requests are intercepted. No live credential or endpoint is required. The browser test retains the abandonment assertion, verifies the API response and existing owner header, distinguishes paid rows, checks all six count cards, and switches to an empty date to ensure stale rows disappear. Failures now save page text and a screenshot. Unit tests cover missing versus configured API URLs and every stage transition, including the ten-minute boundary and paid status surviving out-of-order events.

No customer-facing, pricing, notification, authentication or payment implementation changed in this correction. No merge or production deployment is authorized by these tests.
