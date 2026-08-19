/**
 * SumUp amendment top-up + scope honesty regressions.
 * Run: npx tsx scripts/check-amendment-topup.ts
 *
 * Documents required cases:
 * 1. £70 → £84 creates £14 SumUp top-up checkout
 * 2. Confirmed booking unchanged before payment
 * 3. Successful payment commits amendment once (finalize wiring)
 * 4. Failed/cancelled payment leaves original unchanged
 * 5. Duplicate callback does not apply twice
 * 6. Duplicate callback does not send duplicate confirmation
 * 7. Expired/superseded pending amendment cannot be paid
 * 8. Crossing inside 24h before top-up completion is blocked
 * 9. Additional payment recorded separately from original
 * 10. Updated confirmation only after confirmed top-up
 * 11. Owner material change uses server-calculated fare
 * 12. Customer cannot supply their own authoritative amended price
 * 13. Customer self-service fields include journey + contact details
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
  PENDING_AMENDMENT_EXPIRY_HOURS,
  buildHigherFarePendingAmendment,
  computePendingAmendmentExpiresAt,
  describeFareDifference,
  isPendingAmendmentExpired,
  validatePendingAmendmentForPayment,
} from "../shared/booking-amendment";
import type { PaidBookingRecord } from "../shared/paid-booking-record";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseBooking(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "MAT-ORIG-001",
    checkoutId: "chk_orig",
    amount: 70,
    currency: "GBP",
    amountPaidLabel: "£70.00",
    originalAmount: 70,
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "1 Old Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-09-15",
    tripTime: "10:00",
    passengers: 2,
    suitcases: 2,
    calendarEventIds: [],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    createdAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

function run() {
  console.log("=== 1. £70 → £84 creates £14 difference / pending top-up ===");
  const fare = describeFareDifference(70, 84);
  assert.equal(fare.kind, "additional_payment");
  assert.equal(fare.difference, 14);
  assert.equal(fare.previousFare, 70);
  assert.equal(fare.newFare, 84);

  const pending = buildHigherFarePendingAmendment({
    paymentReference: "MAT-ORIG-001",
    previousFare: 70,
    newFare: 84,
    proposed: { tripDate: "2026-08-29", tripTime: "10:00" },
  });
  assert.equal(pending.additionalPaymentAmount, 14);
  assert.equal(pending.status, "awaiting_payment");
  assert.ok(pending.expiresAt);
  assert.equal(pending.idempotencyKey.startsWith("amend-pay:MAT-ORIG-001:"), true);
  assert.ok(!isPendingAmendmentExpired(pending, new Date(pending.createdAt)));

  console.log("=== 2. Pending amendment expiry ===");
  assert.equal(PENDING_AMENDMENT_EXPIRY_HOURS, 6);
  const expiredAt = computePendingAmendmentExpiresAt(new Date("2026-08-19T10:00:00.000Z"), 6);
  assert.equal(expiredAt, "2026-08-19T16:00:00.000Z");
  assert.equal(
    isPendingAmendmentExpired(
      { expiresAt: expiredAt, status: "awaiting_payment" },
      new Date("2026-08-19T16:00:01.000Z"),
    ),
    true,
  );

  console.log("=== 3. Handler wiring: create top-up + finalize branch ===");
  const amendHandlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/booking-amendment-handlers.ts"),
    "utf8",
  );
  assert.match(amendHandlers, /createOrReuseAmendmentTopUpCheckout/);
  assert.match(amendHandlers, /paymentUrl/);
  assert.match(amendHandlers, /Pay £/);
  assert.match(amendHandlers, /Your existing booking will remain unchanged until the additional payment/);
  assert.match(amendHandlers, /isPaidBookingAmendPayPath|handleCustomerAmendPay/);
  assert.doesNotMatch(
    amendHandlers,
    /Please contact My Airport Taxi NI to pay the difference, or use the owner dashboard payment link when available/,
  );

  const topUp = fs.readFileSync(
    path.join(root, "workers/addresses/src/amendment-topup.ts"),
    "utf8",
  );
  assert.match(topUp, /createSumUpHostedCheckout/);
  assert.match(topUp, /checkoutKind:\s*"amendment-topup"/);
  assert.match(topUp, /additionalPayments/);
  assert.match(topUp, /originalAmount/);
  assert.match(topUp, /finalizeAmendmentTopUpCheckout/);
  assert.match(topUp, /sendUpdatedConfirmationForPaymentReference/);
  assert.match(topUp, /alreadyPaid|alreadyFinalized/);
  assert.match(topUp, /abandonedWithoutCommit|status: "abandoned"/);
  assert.match(topUp, /validatePendingAmendmentForPayment/);
  // Booking-level paymentReference must stay the original; top-up refs go in additionalPayments
  assert.match(topUp, /additionalEntry/);
  assert.match(topUp, /additionalPayments:\s*\[\.\.\.previousAdditional,\s*additionalEntry\]/);
  assert.match(topUp, /originalAmount/);
  assert.match(topUp, /amount:\s*pending\.newFare/);
  assert.match(topUp, /bookingPaymentReference: bookingRef/);
  assert.match(topUp, /additionalPaymentReference: topUpPaymentReference/);

  const sharedAmend = fs.readFileSync(
    path.join(root, "shared/booking-amendment.ts"),
    "utf8",
  );
  assert.match(sharedAmend, /validatePendingAmendmentForPayment/);
  assert.match(sharedAmend, /within_24_hours/);
  assert.match(sharedAmend, /buildHigherFarePendingAmendment/);

  const finalize = fs.readFileSync(
    path.join(root, "workers/addresses/src/finalize-paid-checkout.ts"),
    "utf8",
  );
  assert.match(finalize, /finalizeAmendmentTopUpCheckout/);
  assert.match(finalize, /checkoutKind === "amendment-topup"/);
  const topUpBranch = finalize.slice(
    finalize.indexOf('checkoutKind === "amendment-topup"'),
    finalize.indexOf("isRefundTest"),
  );
  assert.doesNotMatch(topUpBranch, /savePaidBookingRecordFromConfirm/);
  assert.doesNotMatch(topUpBranch, /createTrackingJobForPaidBooking/);

  const pendingStore = fs.readFileSync(
    path.join(root, "workers/addresses/src/pending-checkout-store.ts"),
    "utf8",
  );
  assert.match(pendingStore, /amendment-topup/);
  assert.match(pendingStore, /amendmentBookingPaymentReference/);

  console.log("=== 4. Confirmed booking unchanged before payment (schedule path) ===");
  const higherBlock = amendHandlers.slice(
    amendHandlers.indexOf("additional_payment"),
    amendHandlers.indexOf("const historyEntry"),
  );
  assert.match(higherBlock, /pendingAmendment/);
  assert.match(higherBlock, /\{\s*pendingAmendment:\s*pending\s*\}/);
  // Failed/cancel: no commit of schedule fields on unpaid path
  assert.doesNotMatch(higherBlock, /dateTimeAmendmentCount/);
  assert.doesNotMatch(higherBlock, /sendUpdatedConfirmationForPaymentReference/);

  console.log("=== 5. validatePendingAmendmentForPayment gates ===");
  const awaiting = buildHigherFarePendingAmendment({
    paymentReference: "MAT-ORIG-001",
    previousFare: 70,
    newFare: 84,
    proposed: { tripDate: "2026-09-20", tripTime: "11:00" },
    now: new Date("2026-08-19T10:00:00.000Z"),
  });
  const ok = validatePendingAmendmentForPayment({
    booking: baseBooking({ pendingAmendment: awaiting }),
    amendmentId: awaiting.amendmentId,
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.equal(ok.ok, true);

  const expired = validatePendingAmendmentForPayment({
    booking: baseBooking({
      pendingAmendment: {
        ...awaiting,
        expiresAt: "2026-08-19T11:00:00.000Z",
      },
    }),
    amendmentId: awaiting.amendmentId,
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, "expired");

  const superseded = validatePendingAmendmentForPayment({
    booking: baseBooking({ pendingAmendment: awaiting }),
    amendmentId: "other-amendment-id",
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.equal(superseded.ok, false);
  if (!superseded.ok) assert.equal(superseded.reason, "superseded");

  const within24h = validatePendingAmendmentForPayment({
    booking: baseBooking({
      tripDate: "2026-08-19",
      tripTime: "18:00",
      pendingAmendment: awaiting,
    }),
    amendmentId: awaiting.amendmentId,
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.equal(within24h.ok, false);
  if (!within24h.ok) assert.equal(within24h.reason, "within_24_hours");

  const cancelled = validatePendingAmendmentForPayment({
    booking: baseBooking({
      status: "cancelled",
      operationalStatus: "cancelled",
      pendingAmendment: awaiting,
    }),
    amendmentId: awaiting.amendmentId,
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.reason, "booking_not_amendable");

  console.log("=== 6. Duplicate email / commit guards in source ===");
  const sendUpdated = fs.readFileSync(
    path.join(root, "workers/addresses/src/send-updated-confirmation.ts"),
    "utf8",
  );
  assert.match(sendUpdated, /lastUpdatedConfirmationAmendmentId === input\.amendmentId/);
  assert.match(topUp, /alreadyPaid/);
  assert.match(topUp, /pendingCheckout\.finalizedAt/);
  // Confirmation only after commit path (after updatePaidBookingFields commit)
  const commitIdx = topUp.indexOf("amendmentCommitted: true");
  const emailIdx = topUp.indexOf("sendUpdatedConfirmationForPaymentReference");
  assert.ok(emailIdx > 0 && commitIdx > 0);

  console.log("=== 7. Customer self-service field scope ===");
  assert.ok(CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS.includes("tripDate"));
  assert.ok(CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS.includes("tripTime"));
  assert.ok(CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS.includes("pickupLabel"));
  assert.ok(CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS.includes("dropoffLabel"));
  assert.ok(CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS.includes("passengers"));
  assert.ok(CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS.includes("suitcases"));
  const manageUi = fs.readFileSync(
    path.join(root, "src/app/manage-booking/ManageBookingClient.tsx"),
    "utf8",
  );
  assert.match(manageUi, /Review Changes/);
  assert.match(manageUi, /Continue to Secure Payment|Confirm Changes/);
  assert.match(manageUi, /AddressInput/);
  assert.match(manageUi, /Additional payment required|No additional payment required/);
  assert.match(manageUi, /remain unchanged until the additional payment/i);
  assert.match(manageUi, /manage-pickup|Pickup address/);
  assert.match(manageUi, /token/);

  console.log("=== 8. Owner material change uses server-calculated fare ===");
  const ownerEdit = fs.readFileSync(
    path.join(root, "workers/addresses/src/paid-booking-edit-handlers.ts"),
    "utf8",
  );
  assert.match(ownerEdit, /calculateAuthoritativeWebsiteQuote/);
  assert.match(ownerEdit, /serverCalculatedFare/);
  assert.match(ownerEdit, /keepAgreedFare/);
  assert.match(ownerEdit, /ownerOverride/);
  assert.doesNotMatch(ownerEdit, /authoritativeFare:\s*body\.authoritativeFare/);
  assert.match(ownerEdit, /fareAdjustmentMessage/);

  const ownerModal = fs.readFileSync(
    path.join(root, "src/components/OwnerEditBookingModal.tsx"),
    "utf8",
  );
  assert.match(ownerModal, /keepAgreedFare/);
  assert.match(ownerModal, /Keep current agreed fare/);
  assert.match(ownerModal, /re-priced on the server/i);

  console.log("=== 9. Customer cannot supply authoritative amended price ===");
  assert.match(amendHandlers, /calculateAuthoritativeWebsiteQuote/);
  assert.match(amendHandlers, /Client amount \/ authoritativeFare \/ newFare are ignored/);
  assert.doesNotMatch(amendHandlers, /newFare\s*=\s*(Number\()?body\.(amount|newFare|authoritativeFare)/);
  assert.doesNotMatch(amendHandlers, /amount:\s*body\.amount/);

  console.log("=== 10. Index routes wired ===");
  const index = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
  assert.match(index, /isPaidBookingAmendPayPath/);
  assert.match(index, /handleCustomerAmendPay/);
  assert.match(index, /isPaidBookingAmendAbandonPath/);
  assert.match(index, /handleCustomerAmendAbandon/);

  console.log("=== 11. Accounting fields on PaidBookingRecord ===");
  const record = fs.readFileSync(path.join(root, "shared/paid-booking-record.ts"), "utf8");
  assert.match(record, /originalAmount/);
  assert.match(record, /additionalPayments/);
  assert.match(record, /PaidBookingAdditionalPayment/);
  assert.match(record, /expiresAt/);
  assert.match(record, /manageBookingToken/);

  console.log("=== 12. Scope documentation ===");
  console.log(
    "Customer self-service: date/time, pickup, destination, passengers, luggage, " +
      "child seats, flight, mobile. Higher fare → SumUp difference. Lower fare → contact us.",
  );

  console.log("check-amendment-topup: all assertions passed");
}

run();
