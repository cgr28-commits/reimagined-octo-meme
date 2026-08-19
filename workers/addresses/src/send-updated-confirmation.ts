/**
 * Send (or resend) an updated booking confirmation from the canonical PaidBookingRecord.
 * Never reads pending-checkout.booking for journey content.
 */

import {
  buildUpdatedBookingConfirmationEmail,
} from "../shared/booking-notifications";
import { paidBookingRecordToReceipt } from "../shared/paid-booking-canonical";
import type { PaidBookingAmendmentEvent, PaidBookingRecord } from "../shared/paid-booking-record";
import { summarizeAmendmentChanges } from "../shared/booking-amendment";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
} from "./tracking-store";
import { resolveEmailTrackUrl } from "../shared/tracking";
import {
  getPaidBookingRecord,
  ensureManageBookingToken,
  updatePaidBookingFields,
} from "./paid-booking-store";
import { buildManageBookingUrl } from "../shared/manage-booking-token";

const BUSINESS_NAME = "My Airport Taxi NI";

async function resolveTrackUrl(
  store: KVNamespace | undefined,
  record: PaidBookingRecord,
): Promise<string | undefined> {
  if (!store) return undefined;
  const token = record.trackingToken?.trim();
  let job = token ? await getTrackingJob(store, token) : null;
  if (!job && record.paymentReference?.trim()) {
    job = await findTrackingJobByPaymentReference(store, record.paymentReference.trim());
  }
  return resolveEmailTrackUrl(job);
}

export type SendUpdatedConfirmationResult = {
  sent: boolean;
  error?: string;
  subject: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  paymentReference: string;
  receiptPickupLabel: string;
};

export async function sendUpdatedConfirmationFromCanonicalRecord(input: {
  env: WorkerEmailEnv & { TRACKING_STORE?: KVNamespace };
  record: PaidBookingRecord;
  /** Optional what-changed bullets / fare note from the amendment event. */
  whatChanged?: string[];
  fareNote?: string;
  amendmentId?: string;
  /** When true, persist sent/error timestamps onto the booking record. */
  persistStatus?: boolean;
}): Promise<SendUpdatedConfirmationResult> {
  const receipt = paidBookingRecordToReceipt(input.record);
  const trackUrl = await resolveTrackUrl(input.env.TRACKING_STORE, input.record);
  let manageUrl: string | undefined;
  if (input.env.TRACKING_STORE && input.record.manageBookingToken) {
    manageUrl = buildManageBookingUrl(
      "https://www.myairporttaxini.co.uk",
      input.record.manageBookingToken,
    );
  } else if (input.env.TRACKING_STORE) {
    const withToken = await ensureManageBookingToken(input.env.TRACKING_STORE, input.record);
    if (withToken.manageBookingToken) {
      manageUrl = buildManageBookingUrl(
        "https://www.myairporttaxini.co.uk",
        withToken.manageBookingToken,
      );
    }
  }
  const email = buildUpdatedBookingConfirmationEmail(receipt, BUSINESS_NAME, {
    trackUrl,
    manageUrl,
    whatChanged: input.whatChanged,
    fareNote: input.fareNote,
  });

  // Duplicate finalize/webhook must not re-send the same amendment confirmation.
  if (
    input.amendmentId &&
    input.record.lastUpdatedConfirmationAmendmentId === input.amendmentId &&
    input.record.lastUpdatedConfirmationSentAt
  ) {
    return {
      sent: true,
      subject: email.subject,
      pickupLabel: input.record.pickupLabel,
      dropoffLabel: input.record.dropoffLabel,
      tripDate: input.record.tripDate,
      tripTime: input.record.tripTime,
      paymentReference: input.record.paymentReference,
      receiptPickupLabel: receipt.pickupLabel,
    };
  }

  const sendResult = await trySendBrandedCustomerEmail(input.env, {
    to: input.record.customerEmail,
    toName: input.record.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (input.persistStatus && input.env.TRACKING_STORE) {
    const now = new Date().toISOString();
    const patch: Partial<PaidBookingRecord> = sendResult.sent
      ? {
          lastUpdatedConfirmationSentAt: now,
          lastUpdatedConfirmationError: "",
          lastUpdatedConfirmationAmendmentId: input.amendmentId,
        }
      : {
          lastUpdatedConfirmationError:
            sendResult.error || "Updated confirmation email failed",
          lastUpdatedConfirmationAmendmentId: input.amendmentId,
        };

    // Patch amendment history email fields when amendmentId matches.
    if (input.amendmentId && input.record.amendmentHistory?.length) {
      const history = input.record.amendmentHistory.map((entry) => {
        if (entry.amendmentId !== input.amendmentId) return entry;
        const next: PaidBookingAmendmentEvent = { ...entry };
        if (sendResult.sent) {
          next.confirmationEmailSentAt = now;
          next.confirmationEmailError = undefined;
        } else {
          next.confirmationEmailError =
            sendResult.error || "Updated confirmation email failed";
        }
        return next;
      });
      (patch as { amendmentHistory?: PaidBookingAmendmentEvent[] }).amendmentHistory = history;
    }

    await updatePaidBookingFields(
      input.env.TRACKING_STORE,
      input.record.paymentReference,
      patch as Parameters<typeof updatePaidBookingFields>[2],
      { appendAudit: false },
    );
  }

  return {
    sent: sendResult.sent,
    error: sendResult.sent ? undefined : sendResult.error || "Updated confirmation email failed",
    subject: email.subject,
    pickupLabel: input.record.pickupLabel,
    dropoffLabel: input.record.dropoffLabel,
    tripDate: input.record.tripDate,
    tripTime: input.record.tripTime,
    paymentReference: input.record.paymentReference,
    receiptPickupLabel: receipt.pickupLabel,
  };
}

/** Reload canonical record then send — used after mutations to avoid stale in-memory copies. */
export async function sendUpdatedConfirmationForPaymentReference(input: {
  env: WorkerEmailEnv & { TRACKING_STORE: KVNamespace };
  paymentReference: string;
  whatChanged?: string[];
  fareNote?: string;
  amendmentId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): Promise<SendUpdatedConfirmationResult | null> {
  const record = await getPaidBookingRecord(input.env.TRACKING_STORE, input.paymentReference);
  if (!record) return null;
  const whatChanged =
    input.whatChanged ??
    (input.before && input.after
      ? summarizeAmendmentChanges(input.before, input.after)
      : undefined);
  return sendUpdatedConfirmationFromCanonicalRecord({
    env: input.env,
    record,
    whatChanged,
    fareNote: input.fareNote,
    amendmentId: input.amendmentId,
    persistStatus: true,
  });
}
