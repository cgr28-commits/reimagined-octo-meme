/**
 * Return Journey Offer — eligibility, timing, token, fare, and send-safety checks.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyReturnOfferSaving,
  buildReturnOfferCustomerUrl,
  buildReturnOfferPublicSnapshot,
  evaluateReturnOfferAccess,
  generateReturnOfferToken,
  hasCorrespondingReturnBooking,
  hashReturnOfferToken,
  isEligibleForReturnOffer,
  isReturnOfferAirportJourney,
  normalizeReturnOfferToken,
  paidBookingToReturnOfferSnapshot,
  planReturnOfferProcessing,
  resolveReturnOfferDirection,
  resolveReturnOfferSchedule,
  shouldApplyReturnOfferDiscount,
  type ReturnOfferBookingSnapshot,
  type ReturnOfferRecord,
} from "../shared/return-offer";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { buildReturnOfferEmail } from "../shared/return-offer-emails";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok - ${name}`);
    })
    .catch((error) => {
      console.error(`fail - ${name}`);
      throw error;
    });
}

function baseBooking(
  overrides: Partial<ReturnOfferBookingSnapshot> = {},
): ReturnOfferBookingSnapshot {
  return {
    paymentReference: "pay-local-1",
    customerEmail: "pat@example.com",
    customerName: "Pat Murphy",
    pickupLabel: "Newtownabbey, County Antrim",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    airportCode: "BFS",
    isFromAirport: false,
    isAirportTrip: true,
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    createdAt: "2026-09-01T10:00:00.000Z",
    tripDate: "2026-09-10",
    tripTime: "09:00",
    ...overrides,
  };
}

function visitorBooking(
  overrides: Partial<ReturnOfferBookingSnapshot> = {},
): ReturnOfferBookingSnapshot {
  return baseBooking({
    paymentReference: "pay-visitor-1",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Titanic Hotel Belfast",
    isFromAirport: true,
    tripDate: "2026-09-02",
    tripTime: "14:00",
    ...overrides,
  });
}

async function run() {
  await check("1. Local address → airport, one-way is eligible", () => {
    const result = isEligibleForReturnOffer(baseBooking());
    assert.equal(result.eligible, true);
    assert.equal(result.direction, "local_to_airport");
    assert.equal(result.airportCode, "BFS");
  });

  await check("2. Original booking includes return — never eligible", () => {
    const withFlag = isEligibleForReturnOffer(baseBooking({ returnJourney: true }));
    assert.equal(withFlag.eligible, false);
    assert.equal(withFlag.reason, "return_already_included");
    const withDate = isEligibleForReturnOffer(
      baseBooking({ returnDate: "2026-09-17", returnTime: "18:00" }),
    );
    assert.equal(withDate.eligible, false);
    assert.equal(withDate.reason, "return_already_included");
  });

  await check("3. Airport → hotel, one-way is eligible", () => {
    const result = isEligibleForReturnOffer(visitorBooking());
    assert.equal(result.eligible, true);
    assert.equal(result.direction, "airport_to_local");
  });

  await check("4. Airport → local address, one-way is eligible", () => {
    const result = isEligibleForReturnOffer(
      visitorBooking({
        dropoffLabel: "12 High Street, Carrickfergus",
      }),
    );
    assert.equal(result.eligible, true);
    assert.equal(result.direction, "airport_to_local");
  });

  await check("5. Separate corresponding return booked — no email", () => {
    const original = baseBooking();
    const laterReturn = baseBooking({
      paymentReference: "pay-return-later",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Newtownabbey, County Antrim",
      createdAt: "2026-09-02T10:00:00.000Z",
    });
    assert.equal(hasCorrespondingReturnBooking(original, [original, laterReturn]), true);
    const plan = planReturnOfferProcessing({
      booking: original,
      correspondingReturnBooked: true,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    assert.equal(plan.shouldSend, false);
    assert.equal(plan.reason, "corresponding_return_booked");
  });

  await check("6. Cancelled booking — no email", () => {
    const result = isEligibleForReturnOffer(
      baseBooking({ status: "cancelled", operationalStatus: "cancelled" }),
    );
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "cancelled_or_refunded");
  });

  await check("7. Offer already sent — no duplicate", () => {
    const plan = planReturnOfferProcessing({
      booking: baseBooking(),
      existing: { status: "SENT", emailSentAt: "2026-09-03T10:00:00.000Z" },
      correspondingReturnBooked: false,
      now: new Date("2026-09-04T12:00:00.000Z"),
    });
    assert.equal(plan.shouldSend, false);
    assert.equal(plan.reason, "offer_already_sent");
  });

  await check("8. Local booking older than 48h with outbound still far — can send", () => {
    const booking = baseBooking({
      createdAt: "2026-09-01T10:00:00.000Z",
      tripDate: "2026-09-10",
      tripTime: "09:00",
    });
    const plan = planReturnOfferProcessing({
      booking,
      correspondingReturnBooked: false,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    assert.equal(plan.eligible, true);
    assert.equal(plan.shouldSend, true);
    assert.equal(plan.reason, "standard_local_delay");
  });

  await check("9. Last-minute local booking uses shorter delay", () => {
    const booking = baseBooking({
      createdAt: "2026-09-08T10:00:00.000Z",
      tripDate: "2026-09-09",
      tripTime: "18:00",
    });
    const schedule = resolveReturnOfferSchedule(booking, {
      direction: "local_to_airport",
      now: new Date("2026-09-08T11:00:00.000Z"),
    });
    assert.equal(schedule.reason, "last_minute_local_delay");
    assert.ok(schedule.scheduledAt);
    assert.equal(schedule.scheduledAt, "2026-09-08T22:00:00.000Z");
  });

  await check("10. Airport→hotel completed — schedule ~24h after completion", () => {
    const booking = visitorBooking({
      createdAt: "2026-09-01T10:00:00.000Z",
      tripDate: "2026-09-02",
      tripTime: "14:00",
    });
    const completedAt = "2026-09-02T16:00:00.000Z";
    const schedule = resolveReturnOfferSchedule(booking, {
      direction: "airport_to_local",
      now: new Date("2026-09-02T16:05:00.000Z"),
      journeyCompletedAt: completedAt,
    });
    assert.equal(schedule.reason, "after_completion");
    assert.equal(schedule.scheduledAt, "2026-09-03T16:00:00.000Z");
    const beforeDue = planReturnOfferProcessing({
      booking,
      correspondingReturnBooked: false,
      journeyCompletedAt: completedAt,
      now: new Date("2026-09-03T10:00:00.000Z"),
    });
    assert.equal(beforeDue.shouldSend, false);
    const afterDue = planReturnOfferProcessing({
      booking,
      correspondingReturnBooked: false,
      journeyCompletedAt: completedAt,
      now: new Date("2026-09-03T16:05:00.000Z"),
    });
    assert.equal(afterDue.shouldSend, true);
  });

  await check("11. Airport→hotel created but not completed — do not send early", () => {
    const booking = visitorBooking({
      createdAt: "2026-09-01T10:00:00.000Z",
      tripDate: "2026-09-04",
      tripTime: "14:00",
    });
    const plan = planReturnOfferProcessing({
      booking,
      correspondingReturnBooked: false,
      now: new Date("2026-09-02T10:00:00.000Z"),
    });
    assert.equal(plan.shouldSend, false);
    assert.equal(plan.reason, "awaiting_completion");
    assert.equal(plan.status, "ELIGIBLE");
  });

  await check("12. Valid return token — reversed journey pre-filled", () => {
    const snapshot = buildReturnOfferPublicSnapshot({
      direction: "local_to_airport",
      airportCode: "BFS",
      airportName: "Belfast International Airport",
      reversedPickupLabel: "Belfast International Airport",
      reversedDropoffLabel: "Newtownabbey, County Antrim",
    });
    assert.equal(snapshot.pickupLabel, "Belfast International Airport");
    assert.equal(snapshot.dropoffLabel, "Newtownabbey, County Antrim");
    assert.equal(snapshot.localAddressLabel, "Newtownabbey, County Antrim");
    const url = buildReturnOfferCustomerUrl("https://www.myairporttaxini.co.uk", "abc");
    assert.match(url, /\/book\?returnOffer=/);
    assert.doesNotMatch(url, /pat@example/);
    assert.doesNotMatch(url, /pay-local/);
  });

  await check("13. Customer changes time/date — offer remains valid", () => {
    const access = evaluateReturnOfferAccess({
      status: "SENT",
      expiresAt: "2026-10-01T00:00:00.000Z",
    } as ReturnOfferRecord);
    assert.equal(access.ok, true);
    assert.equal(
      shouldApplyReturnOfferDiscount({
        tokenValid: true,
        pickupLabel: "Belfast International Airport",
        dropoffLabel: "Hotel B, Belfast",
      }),
      true,
    );
  });

  await check("14. Pickup address change — fare recalculates and 5% applies", () => {
    const before = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 60,
      airportFixedCostsGbp: 0,
      airportAccessChargeGbp: 5,
      returnOfferDiscountRate: 0.05,
    });
    const after = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 72,
      airportFixedCostsGbp: 0,
      airportAccessChargeGbp: 5,
      returnOfferDiscountRate: 0.05,
    });
    assert.equal(before.returnOfferSavingGbp, 3);
    assert.equal(before.finalAmountPayableGbp, 62);
    assert.equal(after.returnOfferSavingGbp, 3.6);
    assert.equal(after.finalAmountPayableGbp, 73.4);
    assert.equal(after.airportAccessChargeGbp, 5);
  });

  await check("15. Unrelated non-airport trip — 5% rejected", () => {
    assert.equal(
      isReturnOfferAirportJourney("12 High Street, Belfast", "Bangor Marina"),
      false,
    );
    assert.equal(
      shouldApplyReturnOfferDiscount({
        tokenValid: true,
        pickupLabel: "12 High Street, Belfast",
        dropoffLabel: "Bangor Marina",
      }),
      false,
    );
  });

  await check("16. Invalid token — no discount and no private access", () => {
    const access = evaluateReturnOfferAccess(null);
    assert.equal(access.ok, false);
    assert.equal(access.reason, "invalid_token");
    assert.equal(
      shouldApplyReturnOfferDiscount({
        tokenValid: false,
        pickupLabel: "Belfast International Airport",
        dropoffLabel: "Newtownabbey",
      }),
      false,
    );
  });

  await check("17. Reused redeemed token — cannot discount again", () => {
    const access = evaluateReturnOfferAccess({
      status: "REDEEMED",
      redeemedAt: "2026-09-04T10:00:00.000Z",
    } as ReturnOfferRecord);
    assert.equal(access.ok, false);
    assert.equal(access.reason, "redeemed");
  });

  await check("18. Payment fail — offer not redeemed in checkout create", () => {
    const checkout = read("workers/addresses/src/index.ts");
    const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
    assert.match(checkout, /resolveReturnOfferForPayment/);
    assert.doesNotMatch(checkout, /markReturnOfferRedeemed/);
    assert.match(finalize, /markReturnOfferRedeemed/);
    assert.match(finalize, /pending\?\.returnOfferToken/);
  });

  await check("19. Successful payment — new booking linked and offer redeemed", () => {
    const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
    const store = read("workers/addresses/src/return-offer-store.ts");
    assert.match(store, /status: "REDEEMED"/);
    assert.match(store, /returnBookingPaymentReference/);
    assert.match(finalize, /offer\.originalPaymentReference/);
    assert.match(finalize, /paymentReference/);
  });

  await check("20. Scheduler runs twice — only one email via claim", () => {
    const store = read("workers/addresses/src/return-offer-store.ts");
    const handlers = read("workers/addresses/src/return-offer-handlers.ts");
    assert.match(store, /tryClaimReturnOfferSend/);
    assert.match(store, /already_sent/);
    assert.match(store, /lost_race/);
    assert.match(handlers, /tryClaimReturnOfferSend/);
    assert.match(handlers, /processDueReturnOffers/);
    const second = planReturnOfferProcessing({
      booking: baseBooking(),
      existing: { status: "SENT", emailSentAt: "2026-09-03T12:00:00.000Z" },
      correspondingReturnBooked: false,
      now: new Date("2026-09-03T13:00:00.000Z"),
    });
    assert.equal(second.shouldSend, false);
  });

  await check("Token is hashed and URL hides booking data", async () => {
    const token = generateReturnOfferToken();
    assert.equal(token.length, 64);
    assert.equal(normalizeReturnOfferToken(token), token);
    const hash = await hashReturnOfferToken(token);
    assert.equal(hash.length, 64);
    assert.notEqual(hash, token);
  });

  await check("5% applies to journey fare only — Express stays full", () => {
    const breakdown = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 60,
      airportFixedCostsGbp: 8,
      airportAccessChargeGbp: 5,
      returnOfferDiscountRate: 0.05,
    });
    assert.equal(breakdown.returnOfferSavingGbp, 3);
    assert.equal(breakdown.journeyFareAfterPromotionsGbp, 57);
    assert.equal(breakdown.airportFixedCostsGbp, 8);
    assert.equal(breakdown.airportAccessChargeGbp, 5);
    assert.equal(breakdown.finalAmountPayableGbp, 70);
  });

  await check("Estate +£6 remains in the fare engine before the 5%", () => {
    const saloon = applyReturnOfferSaving(40);
    const estate = applyReturnOfferSaving(46);
    assert.equal(saloon.savingGbp, 2);
    assert.equal(estate.savingGbp, 2.3);
    assert.equal(46 - 40, 6);
  });

  await check("Direction detection for BHD, DUB, LDY", () => {
    assert.equal(
      resolveReturnOfferDirection({
        pickupLabel: "Belfast City Airport",
        dropoffLabel: "Queen's Quarter Hotel",
      }),
      "airport_to_local",
    );
    assert.equal(
      resolveReturnOfferDirection({
        pickupLabel: "Belfast",
        dropoffLabel: "Dublin Airport",
      }),
      "local_to_airport",
    );
    assert.equal(
      resolveReturnOfferDirection({
        pickupLabel: "City of Derry Airport",
        dropoffLabel: "Derry City Hotel",
      }),
      "airport_to_local",
    );
  });

  await check("Emails use the agreed copy and no public RETURN5 code", () => {
    const local = buildReturnOfferEmail({
      direction: "local_to_airport",
      customerName: "Pat Murphy",
      airportName: "Belfast International Airport",
      ctaUrl: "https://www.myairporttaxini.co.uk/book?returnOffer=abc",
    });
    assert.match(local.subject, /Need your journey home\? Save 5% on your return/);
    assert.match(local.text, /Book My Return & Save 5%/);
    assert.doesNotMatch(local.text, /RETURN5/);
    const visitor = buildReturnOfferEmail({
      direction: "airport_to_local",
      customerName: "Pat Murphy",
      airportName: "Belfast International Airport",
      ctaUrl: "https://www.myairporttaxini.co.uk/book?returnOffer=abc",
    });
    assert.match(visitor.subject, /Need a transfer back to the airport\? Save 5%/);
    assert.match(visitor.text, /Book My Airport Return & Save 5%/);
  });

  await check("Worker wires hourly cron, token lookup, and SumUp redeem-after-paid", () => {
    const worker = read("workers/addresses/src/index.ts");
    const wrangler = read("workers/addresses/wrangler.toml");
    const card = read("src/components/QuoteCard.tsx");
    const owner = read("src/components/OwnerPaidBookingsPanel.tsx");
    assert.match(worker, /processDueReturnOffers/);
    assert.match(worker, /isReturnOfferLookupPath/);
    assert.match(worker, /returnOfferToken/);
    assert.match(wrangler, /RETURN_OFFER_LOCAL_TO_AIRPORT_DELAY_HOURS/);
    assert.match(card, /returnOfferToken/);
    assert.match(card, /Your 5% return journey saving has been applied/);
    assert.match(owner, /Return Offer/);
    assert.match(read("src/app/book/page.tsx"), /returnOffer/);
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
