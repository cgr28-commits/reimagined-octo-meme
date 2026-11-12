# 24/7 smart booking approval

Customers can book at any time, and they all go through the same steps: Instant Quote → Booking Details → Secure Payment → "Thank You for Your Booking". The rules below are internal only. Customers never see them.

## Rules (Europe/London, GMT/BST handled)

| Submitted | Time until pickup | Result |
|---|---|---|
| 07:00–23:00 | 12h or more | Confirmed automatically after the Stripe payment is verified |
| 07:00–23:00 | 4–12h | Owner approval, 30-minute deadline |
| 07:00–23:00 | 2–4h | Owner approval, 15-minute deadline |
| 07:00–23:00 | under 2h | Owner approval, 5-minute deadline |
| 23:00–07:00 | any | Owner approval (12h or more: 30 minutes; shorter: the tiers above) |

- Approval time only counts between 07:00 and 23:00. A request sent overnight starts its clock at 07:00. A window that starts at 22:50 gets 10 minutes that evening and the rest from 07:00.
- A request is never confirmed automatically just because the night has ended.
- The deadline is never after pickup. If it would be, the request is turned down gracefully and any card authorisation is released.
- The existing "minimum lead time" setting still rejects pickups that are too close.
- The source code is in `shared/approval-policy.ts`, tested by `scripts/check-approval-policy.ts`.

## Payment

- **Automatic bookings:** the existing Stripe flow is unchanged.
- **Approval bookings:** Stripe Checkout runs with `capture_method=manual` (the existing short-notice card hold). The card is authorised and nothing is charged.
  - **Approve:** the hold is captured. Capture is idempotent, so an already-captured hold counts as success. The booking is then confirmed and the confirmation email is sent.
  - **Decline, expiry, or a request too close to pickup:** the PaymentIntent is cancelled and the customer gets the "Booking Request Unavailable" email. Nobody is ever charged.
  - **Capture fails because the hold has gone** (status `canceled`): the request is declined and the customer is told.
  - **Capture fails for a temporary reason:** the booking stays approved but unpaid and is never confirmed. The 5-minute cron retries. If the card still can't be charged 30 minutes after approval, the request is declined and the hold released.
- Webhooks are signature-verified as before. The hold state is always re-read from the Stripe API, never trusted from the payload.

## Atomic decisions and expiry

`ShortNoticeDecisionCoordinator` is a Durable Object with one instance per request.

- **One decision only:** approve, decline and expire all take the same lock, and the first one wins.
- **Deadline enforced:** an approve or decline at or after the deadline is refused, and the lock becomes "expire".
- **Timer:** a Durable Object alarm is set at the deadline. Alarms survive restarts and deploys and are retried if they fail. When it fires, the request expires, the hold is released and the customer is emailed once.
- **Backstop:** the existing 5-minute cron still sweeps expiries and holds.
- **Audit:** request history on the record, plus the `approval-audit:<ref>` KV log and Worker logs.

## Owner alerts

When a request is waiting (after the card is held), these go out:

1. **Phone push** to the Owner Dashboard Home Screen app. It is sent directly and does not wait for email forwarding.
2. **WhatsApp template** `mat_owner_booking_approval` to `OWNER_APPROVAL_WHATSAPP`, with Approve and Decline buttons.
3. **Owner email** (existing), now with the one-tap link.

Alert failures never change the booking's pending state.

Every confirmed paid booking now also sends a direct "New confirmed booking" push.

One-tap links go to `/owner/decision/?t=<token>`. The token is HMAC-SHA256 signed with `OWNER_APPROVAL_LINK_SECRET`, falling back to `OWNER_ACCESS_KEY`. It names a single booking and expires at that booking's deadline. The page removes the token from the address bar, shows the booking, and only acts after a button press. The token is sent in a POST body and is never logged.

## Setup still needed (owner)

- **Submit the WhatsApp template:** add `mat_owner_booking_approval` in WhatsApp Manager, or through the existing templates tool. Until Meta approves it, WhatsApp alerts are skipped; push and email still work.
- **Worker secret `OWNER_APPROVAL_WHATSAPP`:** the owner's own mobile. It is kept out of the repo.
- **Optional Worker secret `OWNER_APPROVAL_LINK_SECRET`:** use this so the approval links don't depend on the owner key.
- **Stripe:** no settings to change.
