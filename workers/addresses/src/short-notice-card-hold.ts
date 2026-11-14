/**
 * Short-notice requests with a Stripe card hold.
 *
 * 1. Customer sends a short-notice request → their card is authorised (held)
 *    for the quoted fare on our /pay/card/ page. Nothing is charged.
 * 2. Owner taps Approve → the hold is charged and the booking is confirmed
 *    (index.ts: captureShortNoticeHoldAndConfirm).
 * 3. Decline, no answer in time, or an alternative time → the hold is released.
 *
 * Only used when Stripe is active for the booking. While the customer has not
 * authorised yet (`awaitingCardHold`), the request is hidden from the owner and
 * cannot be approved; the owner request email is sent once the card is held.
 * Older requests made before this (no `awaitingCardHold`) still fall back to
 * the normal payment link if the hold was never authorised.
 */
import {
  createStripeCheckoutSession,
  stripeConfigured,
} from "../shared/stripe-payments";
import { shortNoticeResponseExpiresAtIso, type ShortNoticeBookingRecord } from "../shared/short-notice-booking";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { getShortNoticeByReference, saveShortNoticeBooking } from "./short-notice-store";
import { getPendingCheckout, savePendingCheckout, type PendingCheckoutRecord } from "./pending-checkout-store";
import { getCheckoutHoldState, releaseCheckoutHold } from "./stripe-holds";
import { formatLondonClockTime } from "../shared/uk-time";

const INDEX_PREFIX = "sn-card-hold:";
const INDEX_TTL_SECONDS = 9 * 24 * 3600;

export const SHORT_NOTICE_HOLD_KIND = "short_notice";

function formatGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

/** Where the customer lands after authorising (static page on our site). */
export function shortNoticeHoldReturnUrl(siteOrigin: string, reference: string): string {
  return `${siteOrigin.replace(/\/+$/, "")}/pay/hold-received/?ref=${encodeURIComponent(reference)}`;
}

/** Create the hold session for a new request. Returns the on-site payment page URL. */
export async function startShortNoticeCardHold(input: {
  store: KVNamespace;
  record: ShortNoticeBookingRecord;
  booking: PaidBookingDetails;
  siteOrigin: string;
  description: string;
}): Promise<{ paymentUrl: string; checkoutId: string }> {
  const { store, record } = input;
  const amount = Math.round(record.amount * 100) / 100;
  const checkoutReference = `${record.reference}-HOLD`;
  const session = await createStripeCheckoutSession({
    amount,
    description: input.description,
    checkoutReference,
    returnUrl: shortNoticeHoldReturnUrl(input.siteOrigin, record.reference),
    customerEmail: input.booking.customerEmail,
    manualCapture: true,
    siteOrigin: input.siteOrigin,
    metadata: { hold_kind: SHORT_NOTICE_HOLD_KIND, short_notice_reference: record.reference },
  });

  const pending: PendingCheckoutRecord = {
    checkoutId: session.checkoutId,
    checkoutReference,
    amount,
    booking: input.booking,
    createdAt: session.createdAt,
    checkoutKind: "short-notice-hold",
    shortNoticeToken: record.paymentToken,
    shortNoticeReference: record.reference,
    paymentMethod: "FULL_ONLINE",
    totalFare: amount,
    onlineAmountPaid: amount,
    cashBalanceDue: 0,
  } as PendingCheckoutRecord;
  await savePendingCheckout(store, pending);

  const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
  await saveShortNoticeBooking(store, {
    ...latest,
    cardHold: {
      checkoutId: session.checkoutId,
      checkoutReference,
      amount,
      createdAt: session.createdAt,
    },
    updatedAt: new Date().toISOString(),
  });
  await store.put(`${INDEX_PREFIX}${record.reference}`, record.reference, {
    expirationTtl: INDEX_TTL_SECONDS,
  });
  return { paymentUrl: session.paymentUrl, checkoutId: session.checkoutId };
}

type OwnerEmailFn = (subject: string, body: string) => Promise<void>;
type CustomerReceivedFn = (record: ShortNoticeBookingRecord) => Promise<void>;
/** Push + WhatsApp alert; returns the one-tap decision link for the email (if any). */
type OwnerAlertFn = (record: ShortNoticeBookingRecord) => Promise<{ link: string | null }>;

async function alertOwnerSafely(
  alert: OwnerAlertFn | undefined,
  record: ShortNoticeBookingRecord,
): Promise<string> {
  if (!alert) return "";
  try {
    const { link } = await alert(record);
    return link ? `\n\nApprove or decline from your phone (secure link, expires at the deadline):\n${link}` : "";
  } catch (error) {
    console.error("Owner approval alert failed", record.reference, error instanceof Error ? error.message : "");
    return "";
  }
}

function holdIsReleasable(record: ShortNoticeBookingRecord): boolean {
  return (
    record.status === "SHORT_NOTICE_DECLINED" ||
    record.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" ||
    record.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ||
    record.status === "SHORT_NOTICE_EXPIRED" ||
    // Paid some other way (payment link) while a hold was still on the card.
    record.status === "SHORT_NOTICE_PAID"
  );
}

/** A request whose card was never held and whose response deadline has passed. */
function awaitingHoldIsStale(record: ShortNoticeBookingRecord, now: Date): boolean {
  if (!record.awaitingCardHold || !record.shortNoticeExpiresAt) return false;
  const deadline = new Date(record.shortNoticeExpiresAt).getTime();
  return Number.isFinite(deadline) && deadline <= now.getTime();
}

/**
 * Stripe says the customer finished the hold page. Record it, tell the owner,
 * or release it straight away if the request is no longer open.
 *
 * For requests waiting on the card (`awaitingCardHold`) this is the moment the
 * request reaches the owner: the saved request email is sent, the response
 * window starts now, and the customer gets their "request received" email.
 */
export async function noteShortNoticeHoldAuthorised(input: {
  store: KVNamespace;
  pending: PendingCheckoutRecord;
  emailOwner: OwnerEmailFn;
  sendCustomerRequestReceived?: CustomerReceivedFn;
  alertOwner?: OwnerAlertFn;
  now?: Date;
}): Promise<void> {
  const reference = input.pending.shortNoticeReference ?? "";
  if (!reference) return;
  const record = await getShortNoticeByReference(input.store, reference);
  const hold = record?.cardHold;
  if (!record || !hold || hold.checkoutId !== input.pending.checkoutId) return;
  if (hold.authorisedAt || hold.releasedAt || hold.capturedAt) return;

  const state = await getCheckoutHoldState(hold.checkoutId);
  if (state.paymentIntentStatus !== "requires_capture") return;

  const nowDate = input.now ?? new Date();
  if (holdIsReleasable(record) || awaitingHoldIsStale(record, nowDate)) {
    await releaseShortNoticeHold(input.store, record, "request_no_longer_open");
    return;
  }

  const now = nowDate.toISOString();
  if (record.awaitingCardHold) {
    // Response window runs from when the card was held, not when the form was sent.
    const shortNoticeExpiresAt =
      record.underMinimumNotice && record.shortNoticeExpiresAt
        ? shortNoticeResponseExpiresAtIso(
            now,
            record.shortNoticeConfirmationWindowHours,
            record.booking,
            record.approvalTier,
          )
        : record.shortNoticeExpiresAt;
    const released: ShortNoticeBookingRecord = {
      ...record,
      awaitingCardHold: false,
      deferredOwnerEmail: undefined,
      cardHold: { ...hold, authorisedAt: now },
      ...(shortNoticeExpiresAt ? { shortNoticeExpiresAt } : {}),
      updatedAt: now,
    };
    await saveShortNoticeBooking(input.store, released);
    if (
      shortNoticeExpiresAt &&
      record.underMinimumNotice &&
      new Date(shortNoticeExpiresAt).getTime() <= nowDate.getTime()
    ) {
      // Card held too close to pickup to approve safely: don't ask the owner.
      // The deadline timer / cron expires it, releases the hold and emails
      // the customer that it couldn't be confirmed (nothing charged).
      console.log("Short-notice hold authorised too late to approve", record.reference);
      return;
    }
    const respondBy = shortNoticeExpiresAt ? formatLondonClockTime(shortNoticeExpiresAt) : "";
    // Phone alerts first (fast); the request is already saved as pending, so
    // a push/WhatsApp failure never changes its state.
    const linkFooter = await alertOwnerSafely(input.alertOwner, released);
    const deferred = record.deferredOwnerEmail;
    if (deferred) {
      await input.emailOwner(
        deferred.subject.split("{{RESPOND_BY}}").join(respondBy),
        deferred.body.split("{{RESPOND_BY}}").join(respondBy) + linkFooter,
      );
    } else {
      await input.emailOwner(
        `SHORT-NOTICE BOOKING REQUEST — ${record.reference} (card held ${formatGbp(hold.amount)})`,
        `New short-notice request ${record.reference} (${record.booking.tripDate} ${record.booking.tripTime}).\n` +
          `Card held: ${formatGbp(hold.amount)} (not charged yet).\n` +
          (respondBy ? `Respond by ${respondBy}\n` : "") +
          `Open the Owner Dashboard to Approve, Offer alternative time, or Decline.` +
          linkFooter,
      );
    }
    if (input.sendCustomerRequestReceived) {
      try {
        await input.sendCustomerRequestReceived(released);
      } catch (error) {
        console.error(
          "Short-notice request-received email failed",
          record.reference,
          error instanceof Error ? error.message : "",
        );
      }
    }
    return;
  }

  await saveShortNoticeBooking(input.store, {
    ...record,
    cardHold: { ...hold, authorisedAt: now },
    updatedAt: now,
  });
  await input.emailOwner(
    `Card held — ${record.reference} (${formatGbp(hold.amount)})`,
    `${record.booking.customerName || "The customer"} has authorised a card hold of ${formatGbp(hold.amount)} ` +
      `for short-notice request ${record.reference} (${record.booking.tripDate} ${record.booking.tripTime}).\n\n` +
      `Nothing has been charged yet.\n` +
      `• Approve in the Owner Dashboard → the card is charged and the booking is confirmed automatically.\n` +
      `• Decline, or let the request expire → the hold is released and the customer pays nothing.`,
  );
}

/** Release the hold and mark the record. Never throws. */
export async function releaseShortNoticeHold(
  store: KVNamespace,
  record: ShortNoticeBookingRecord,
  reason: string,
): Promise<boolean> {
  const hold = record.cardHold;
  if (!hold || hold.releasedAt || hold.capturedAt || !stripeConfigured()) return false;
  try {
    await releaseCheckoutHold(hold.checkoutId);
    const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
    const now = new Date().toISOString();
    await saveShortNoticeBooking(store, {
      ...latest,
      cardHold: { ...(latest.cardHold ?? hold), releasedAt: now, releaseReason: reason },
      updatedAt: now,
    });
    await store.delete(`${INDEX_PREFIX}${record.reference}`);
    return true;
  } catch (error) {
    console.error(
      "Short-notice hold release failed",
      record.reference,
      error instanceof Error ? error.message : "",
    );
    return false;
  }
}

/** Cron: release holds on requests that were declined, expired or changed. */
export async function sweepShortNoticeCardHolds(
  store: KVNamespace | undefined,
  notify?: {
    emailOwner: OwnerEmailFn;
    sendCustomerRequestReceived?: CustomerReceivedFn;
    alertOwner?: OwnerAlertFn;
  },
): Promise<{ released: number; closed: number; authorised: number }> {
  const result = { released: 0, closed: 0, authorised: 0 };
  if (!store || !stripeConfigured()) return result;
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: INDEX_PREFIX, cursor });
    for (const { name } of page.keys) {
      const reference = name.slice(INDEX_PREFIX.length);
      const record = await getShortNoticeByReference(store, reference);
      const hold = record?.cardHold;
      if (!record || !hold || hold.releasedAt || hold.capturedAt) {
        await store.delete(name);
        result.closed += 1;
        continue;
      }
      if (holdIsReleasable(record)) {
        if (await releaseShortNoticeHold(store, record, record.status.toLowerCase())) {
          result.released += 1;
        }
        continue;
      }
      // Backstop for a missed Stripe webhook: if the card is now held, pass
      // the request to the owner; if it went stale unheld, close it quietly.
      if (record.awaitingCardHold && !hold.authorisedAt) {
        try {
          if (awaitingHoldIsStale(record, new Date())) {
            if (await releaseShortNoticeHold(store, record, "never_authorised")) {
              result.released += 1;
            }
            continue;
          }
          if (!notify) continue;
          const state = await getCheckoutHoldState(hold.checkoutId);
          if (state.paymentIntentStatus !== "requires_capture") continue;
          const pending = await getPendingCheckout(store, hold.checkoutId);
          if (!pending) continue;
          await noteShortNoticeHoldAuthorised({
            store,
            pending,
            emailOwner: notify.emailOwner,
            sendCustomerRequestReceived: notify.sendCustomerRequestReceived,
            alertOwner: notify.alertOwner,
          });
          result.authorised += 1;
        } catch (error) {
          console.error(
            "Short-notice awaiting-hold check failed",
            reference,
            error instanceof Error ? error.message : "",
          );
        }
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return result;
}
