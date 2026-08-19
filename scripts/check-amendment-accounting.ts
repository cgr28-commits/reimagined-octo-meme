/**
 * Lower-fare / collected-vs-journey accounting + SumUp return regressions.
 * Run: npx tsx scripts/check-amendment-accounting.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  amountActuallyRefundedOf,
  buildLowerFareAmendmentFareNote,
  grossAmountCollectedOf,
  journeyFareOf,
  netAmountRetainedOf,
  refundDueToAlignWithJourneyFare,
  type PaidBookingRecord,
} from "../shared/paid-booking-record";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function base(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "MAT-ACCT-001",
    checkoutId: "chk_acct",
    amount: 84,
    currency: "GBP",
    amountPaidLabel: "£84.00",
    originalAmount: 84,
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "1 Old Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-09-15",
    tripTime: "10:00",
    calendarEventIds: [],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    createdAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

function run() {
  console.log("=== 1. £84 paid → £70 journey before refund ===");
  const beforeRefund = base({
    amount: 70,
    amountPaidLabel: "£84.00",
    originalAmount: 84,
    refundDueAmount: 14,
    amountRefunded: 0,
  });
  assert.equal(journeyFareOf(beforeRefund), 70);
  assert.equal(grossAmountCollectedOf(beforeRefund), 84);
  assert.equal(amountActuallyRefundedOf(beforeRefund), 0);
  assert.equal(netAmountRetainedOf(beforeRefund), 84);
  assert.equal(refundDueToAlignWithJourneyFare(beforeRefund, 70), 14);

  const fareNote = buildLowerFareAmendmentFareNote({ newFare: 70, refundDue: 14 });
  assert.match(fareNote, /Updated journey price: £70\.00/);
  assert.match(fareNote, /Refund due: £14\.00/);
  assert.doesNotMatch(fareNote, /Refund issued/i);

  console.log("=== 2. After £14 refund ===");
  const afterRefund = base({
    amount: 70,
    amountPaidLabel: "£84.00",
    originalAmount: 84,
    amountRefunded: 14,
    refundDueAmount: 0,
  });
  assert.equal(journeyFareOf(afterRefund), 70);
  assert.equal(grossAmountCollectedOf(afterRefund), 84);
  assert.equal(amountActuallyRefundedOf(afterRefund), 14);
  assert.equal(netAmountRetainedOf(afterRefund), 70);
  assert.equal(refundDueToAlignWithJourneyFare(afterRefund, 70), 0);

  console.log("=== 3. Top-up accounting still correct ===");
  const afterTopUp = base({
    amount: 84,
    originalAmount: 70,
    amountPaidLabel: "£84.00",
    additionalPayments: [
      {
        amount: 14,
        checkoutId: "chk_top",
        paymentReference: "TOP-14",
        amendmentId: "amd1",
        paidAt: "2026-08-19T12:00:00.000Z",
      },
    ],
  });
  assert.equal(grossAmountCollectedOf(afterTopUp), 84);
  assert.equal(journeyFareOf(afterTopUp), 84);
  assert.equal(netAmountRetainedOf(afterTopUp), 84);

  console.log("=== 4. Handler wiring: lower-fare keeps amountPaidLabel ===");
  const amendHandlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/booking-amendment-handlers.ts"),
    "utf8",
  );
  const lowerBlock = amendHandlers.slice(
    amendHandlers.indexOf("Lower fare:"),
    amendHandlers.indexOf("const updated = await updatePaidBookingFields"),
  );
  assert.match(lowerBlock, /amount:\s*newFare/);
  assert.match(lowerBlock, /refundDueAmount/);
  assert.match(lowerBlock, /originalAmount/);
  assert.doesNotMatch(lowerBlock, /amountPaidLabel:\s*`£\$\{newFare/);
  assert.match(amendHandlers, /buildLowerFareAmendmentFareNote/);
  assert.match(amendHandlers, /Updated journey price/);
  assert.doesNotMatch(
    amendHandlers.slice(
      amendHandlers.indexOf("buildLowerFareAmendmentFareNote"),
      amendHandlers.indexOf("sendUpdatedConfirmationForPaymentReference"),
    ),
    /Refund issued/,
  );

  console.log("=== 5. Owner material amendment does not confuse collected vs fare ===");
  const ownerEdit = fs.readFileSync(
    path.join(root, "workers/addresses/src/paid-booking-edit-handlers.ts"),
    "utf8",
  );
  assert.match(ownerEdit, /grossAmountCollectedOf/);
  assert.match(ownerEdit, /refundDueToAlignWithJourneyFare/);
  assert.doesNotMatch(ownerEdit, /amountPaidLabel:\s*`£\$\{serverCalculatedFare/);
  assert.match(ownerEdit, /Journey fare only/);

  console.log("=== 6. Refund handler uses gross collected + preserves journey fare ===");
  const refund = fs.readFileSync(
    path.join(root, "workers/addresses/src/refund-handlers.ts"),
    "utf8",
  );
  assert.match(refund, /grossAmountCollectedOf/);
  assert.match(refund, /moneyFieldsAfterRefund/);
  assert.match(refund, /journeyFareOf/);
  assert.match(refund, /refundDueAmount: dueAfter/);

  console.log("=== 7. SumUp return works after browser state is lost ===");
  const manageUi = fs.readFileSync(
    path.join(root, "src/app/manage-booking/ManageBookingClient.tsx"),
    "utf8",
  );
  assert.match(manageUi, /loadBookingAfterAmendmentReturn/);
  assert.match(manageUi, /AMEND_RETURN_STORAGE_KEY|sessionStorage/);
  assert.match(manageUi, /confirmPaidBooking\(checkoutId\)/);
  assert.doesNotMatch(manageUi, /searchParams\.set\([\"']email/);
  const api = fs.readFileSync(path.join(root, "src/lib/booking-amendment-api.ts"), "utf8");
  assert.match(api, /amend-return/);
  const index = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
  assert.match(index, /isPaidBookingAmendReturnPath/);
  assert.match(index, /handleCustomerAmendReturn/);
  assert.match(index, /amendmentBooking|amendmentTopUp/);

  console.log("check-amendment-accounting: all assertions passed");
}

run();
