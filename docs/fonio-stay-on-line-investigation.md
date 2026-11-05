# Stay on the Line While Customer Books — investigation

**Status:** investigation only. No Worker deploy. No live Fonio setting changes without approval.  
**Assistant:** Olivia (`02235562-7459-4a12-952c-576c8bd28eb6`)  
**Checked:** 5 Nov 2026 (Europe/London) against live Fonio agent API + public Fonio docs.

## Goal

After Send Booking Link, ask whether the caller wants Olivia to remain on the call while they complete `/book-quote` → Stripe Checkout. If yes: stay quiet, help when spoken to, verify payment only via our backend, never take card details, never duplicate bookings or SMS.

## Fonio capabilities (actual)

| Setting / behaviour | Olivia live value | Units / notes | Implication |
|---------------------|-------------------|---------------|-------------|
| Maximum call duration (`maxCallDuration`) | **20** | **Minutes** (UI: “After this time (in minutes), the call is automatically ended”) | Quote + checkout must finish within remaining time; 20 min is usually enough if raised silence wait works. |
| Maximum wait / silence hang-up (`endCallAfterSilenceTimeout`) | **15** | **Seconds** (UI: “After this time (in seconds) without a response, the call is ended”; validation **min 5**) | **Hard blocker.** Checkout needs minutes of silence; line drops after 15s today. |
| `turnEagerness` | `patient` | Already patient | Helps avoid filling every pause; keep this. |
| `backChannelChatMode` | `deactivated` | — | Good — less filler (“mm-hm”) during quiet. |
| Interruptions | Sensitivity 0.35; not fully disabled | — | Fine for “speak when you need help”. |
| Ambient sound | `office` volume 1 | Soft background | Optional presence while waiting; not a hold queue. |
| Dedicated “hold / mute while customer books” mode | **None found** | Docs only cover max duration + max wait | Feature must be **prompt + settings**, not a Fonio product switch. |
| During-call HTTP tools | Supported (~5s tool timeout) | Existing Booking Lookup / Send Booking Link | Reuse; do not invent paid status in the prompt. |
| Static end messages | Fonio has translated “Is anyone still there?” / max-duration messages | Platform behaviour on inactivity / max length | Caller may hear a platform goodbye if silence wait elapses. |

Sources: [Fonio technical settings](https://fonio.info/en/get-started/technical), [Call Settings KB](https://fonio-knowledge-base.help.usepylon.com/articles/7526821089-anruf-einstellungen), live `GET /api/agents/{id}` fields, Fonio app i18n strings for units.

### What Fonio does **not** give us

- No API to “enter hold mode” or pause the LLM for N minutes while keeping the SIP leg.
- No webhook that fires when Stripe Checkout completes mid-call (we only learn payment via our Worker/Stripe webhook → paid booking store).
- No guarantee the assistant stays silent without prompt discipline + a long enough Maximum Wait Time.

## Existing MATNI integrations (preserve)

- **Get Quote** → Quick Quote + `/book-quote/?id=…`
- **Send Booking Link** → WhatsApp/SMS once per voice quote memo; Stripe Checkout unchanged
- **Booking Lookup** → discloses details only when **MAT reference + mobile** match a **paid** booking (`verified: true`)
- **Provisional Booking** → hold only; not paid
- Cards: never on the phone (prompt + product already)

## Gaps for “I’ve paid — confirm it”

1. **Silence timeout** — must be raised (approval) or the stay-on-line path fails in practice.
2. **Booking Lookup identity** — after Checkout, confirmation shows a MAT reference. Pilot can ask the caller to read that reference, then Lookup. A later optional Worker endpoint (`quoteId` + mobile → `paid | pending | unknown`) would avoid asking for the MAT ref; **not required for a prompt pilot** and must not replace Stripe/webhook truth.
3. **Duplicate sends** — Send Booking Link is scoped to a voice quote memo and WhatsApp `already_sent`; prompt must forbid re-calling Send Booking Link / Provisional Booking during the wait unless the caller explicitly asks to resend the link.
4. **Max duration** — long quotes + slow checkout can hit 20 minutes; monitor hang-up reason `max_call_duration_reached`.

## Proposed behaviour (pilot — prompt only)

After successful Send Booking Link (and SMS add-on if needed):

1. Ask **once**: stay on the line while they complete the secure website booking, or finish in their own time?
2. If **no**: normal goodbye; do not chase.
3. If **yes**:
   - Acknowledge once: she’ll stay quiet; they can speak anytime for help; they may hang up whenever they wish.
   - **Do not** poll “are you finished?” on a timer.
   - Answer questions (cancellation, what’s on the page, flight field) without inventing payment state.
   - **Never** ask for card numbers / CVV / OTP.
4. When they say they’ve paid / finished:
   - Collect MAT reference (from confirmation) + mobile on the booking if not already known.
   - Call **Booking Lookup**.
   - Confirm journey **only** when `verified` / tool `say` indicates a found paid booking.
   - If not found: payment may still be processing — offer to check again when they are ready; never invent paid.
5. Never create a second quote/booking or resend SMS/WhatsApp unless they ask.

## Settings recommendation (approval-gated; not applied)

| Setting | Current | Suggested pilot | Why |
|---------|---------|-----------------|-----|
| Maximum Wait Time | 15s | **180–300s** | Allow Stripe form silence without hang-up |
| Maximum Call Duration | 20 min | Keep **20** initially; raise if needed | Cost control |
| turnEagerness | patient | Keep | Quiet wait |
| backChannelChatMode | deactivated | Keep | Less filler |

**Trade-off:** longer Maximum Wait Time means abandoned/forgotten calls consume more minutes before inactivity hang-up.

## Implementation phases (do not run without approval)

### Phase A — Pilot (Fonio only)

- Prompt section: “Stay on the line while they book”.
- Tool config note: during wait, only Booking Lookup (and Leave Message if needed); no Send Booking Link unless resend requested.
- Raise Olivia Maximum Wait Time as above.
- Manual test calls: silence for 2+ minutes, then “I’ve paid” → Lookup.

### Phase B — Harden (Worker; separate approval)

- Optional `POST /voice/payment-status` `{ quoteId, mobile }` → `{ status: paid|pending|unknown, say }` reading paid-booking / unfinished-payment stores — still never trusts the caller alone.
- Idempotent guards documented in tool responses (`already_sent`, memo missing).

### Phase C — Observability

- After-call field `stayOnLine=true|false`.
- Review Fonio disconnect reasons: `ended_due_to_inactivity` vs `max_call_duration_reached`.

## Out of scope / non-goals

- Collecting cards on the call
- Replacing Stripe Checkout
- Auto-confirming paid from the Checkout success URL alone
- Deploying Worker or changing live Olivia settings in this investigation

## Verdict

**Feasible** as a prompt-led wait on the existing Stripe + Booking Lookup path, **blocked today** by Olivia’s **15-second** Maximum Wait Time. Next step after approval: Phase A prompt + silence timeout change only — no Worker deploy required for the pilot.
