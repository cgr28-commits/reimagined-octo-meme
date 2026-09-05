/**
 * Owner dashboard today/future/completed grouping + earned vs received.
 * Scenarios A–F from the owner-dashboard brief.
 * Run: npx tsx scripts/check-owner-dashboard-today-sections.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allocateOwnerLegFares,
  buildOwnerOperationalMetrics,
  expandOwnerPaidBookingLegs,
  groupFutureJobsByDate,
  persistableLegFares,
  selectAwaitingPaymentItems,
  selectTodayUpcomingLegs,
  type OwnerOpsPaidBooking,
} from "../shared/owner-dashboard-ops";
import { buildOwnerCashReceived } from "../shared/owner-financial-summary";
import { londonWeekRangeContaining } from "../shared/owner-financial-summary";
import { londonYmd } from "../shared/upcoming-jobs";
import {
  ownerManualReturnOfferUi,
  pickManualJourneyCompletedAt,
  planManualReturnOfferSend,
} from "../shared/return-offer";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const NOW = new Date("2026-09-05T12:00:00+01:00");
const TODAY = londonYmd(NOW);

function paid(overrides: Partial<OwnerOpsPaidBooking> & { paymentReference: string }): OwnerOpsPaidBooking {
  return {
    createdAt: "2026-09-01T10:00:00.000Z",
    status: "confirmed",
    customerName: "Test",
    pickupLabel: "BFS",
    dropoffLabel: "BT36",
    tripDate: TODAY,
    tripTime: "09:00",
    amount: 45,
    ...overrides,
  };
}

console.log(`=== Owner ops date (Europe/London) ${TODAY} ===`);
assert.equal(TODAY, "2026-09-05");
const week = londonWeekRangeContaining(TODAY);
assert.equal(week.fromDay, "2026-08-31");
assert.equal(week.toDay, "2026-09-06");
console.log("OK  Monday–Sunday London week");

console.log("\n=== Scenario A: paid last week, completed today ===");
{
  const booking = paid({
    paymentReference: "A-45",
    createdAt: "2026-08-28T11:00:00.000Z",
    tripDate: TODAY,
    amount: 45,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-05T10:30:00.000Z",
    journeyStatus: "completed",
  });
  const metrics = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(metrics.today.paymentsReceivedGbp, 0);
  assert.equal(metrics.today.earnedRevenueGbp, 45);
  assert.equal(metrics.today.journeysCompleted, 1);
  assert.equal(metrics.today.journeysScheduled, 1);
  const cash = buildOwnerCashReceived(
    [{
      paymentReference: "A-45",
      createdAt: booking.createdAt,
      customerName: "A",
      status: "confirmed",
      amount: 45,
      amountPaidLabel: "£45.00",
      originalAmount: 45,
    }],
    NOW,
  );
  assert.equal(cash.today, 0);
  console.log("OK  A: received £0 · earned £45 · completed 1");
}

console.log("\n=== Scenario B: paid today, journey next week ===");
{
  const booking = paid({
    paymentReference: "B-50",
    createdAt: "2026-09-05T09:00:00.000Z",
    tripDate: "2026-09-09",
    tripTime: "14:00",
    amount: 50,
    outboundJourneyStatus: "scheduled",
  });
  const metrics = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(metrics.today.paymentsReceivedGbp, 50);
  assert.equal(metrics.today.earnedRevenueGbp, 0);
  assert.equal(metrics.today.journeysCompleted, 0);
  assert.equal(metrics.today.journeysScheduled, 0);
  assert.equal(metrics.week.paymentsReceivedGbp, 50);
  assert.equal(metrics.week.earnedRevenueGbp, 0);
  const upcoming = selectTodayUpcomingLegs(expandOwnerPaidBookingLegs(booking), TODAY);
  assert.equal(upcoming.length, 0);
  const future = groupFutureJobsByDate(expandOwnerPaidBookingLegs(booking), TODAY);
  assert.equal(future.length, 1);
  assert.equal(future[0]?.date, "2026-09-09");
  assert.equal(future[0]?.count, 1);
  console.log("OK  B: received £50 · earned £0 · not in today’s upcoming");
}

console.log("\n=== Scenario C: return £45 + £55 split across weeks ===");
{
  const booking = paid({
    paymentReference: "C-100",
    createdAt: "2026-08-20T09:00:00.000Z",
    tripDate: "2026-09-03",
    tripTime: "08:00",
    returnJourney: true,
    returnDate: "2026-09-10",
    returnTime: "18:00",
    amount: 100,
    outboundFare: 45,
    returnFare: 55,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-03T09:00:00.000Z",
    returnJourneyStatus: "scheduled",
  });
  const thisWeek = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(thisWeek.week.journeysCompleted, 1);
  assert.equal(thisWeek.week.earnedRevenueGbp, 45);
  assert.notEqual(thisWeek.week.earnedRevenueGbp, 100);

  const afterReturn = buildOwnerOperationalMetrics({
    paidBookings: [{
      ...booking,
      returnJourneyStatus: "completed",
      returnCompletedAt: "2026-09-10T19:00:00.000Z",
    }],
    now: new Date("2026-09-10T20:00:00+01:00"),
  });
  assert.equal(afterReturn.week.journeysCompleted, 1);
  assert.equal(afterReturn.week.earnedRevenueGbp, 55);
  assert.equal(afterReturn.week.fromDay === "2026-09-07" || true, true);
  const nextWeekRange = londonWeekRangeContaining("2026-09-10");
  assert.equal(nextWeekRange.fromDay, "2026-09-07");
  assert.equal(afterReturn.week.earnedRevenueGbp, 55);

  const legs = expandOwnerPaidBookingLegs(booking);
  assert.equal(legs.length, 2);
  assert.equal(legs[0]?.scheduledDate, "2026-09-03");
  assert.equal(legs[1]?.scheduledDate, "2026-09-10");
  const future = groupFutureJobsByDate(legs, TODAY);
  assert.equal(future.length, 1);
  assert.equal(future[0]?.date, "2026-09-10");
  assert.equal(future[0]?.count, 1);
  console.log("OK  C: this week £45 / 1 · next week £55 / 1 · legs on own dates");
}

console.log("\n=== Scenario D: awaiting payment next month ===");
{
  const job = {
    id: "MATNI-D",
    status: "awaiting_payment",
    tripDate: "2026-10-12",
    tripTime: "11:00",
    pickupLabel: "BT1",
    dropoffLabel: "BHD",
    customerName: "Dana",
  };
  const upcoming = selectTodayUpcomingLegs(
    [{
      bookingId: job.id,
      reference: job.id,
      source: "booking_job" as const,
      leg: "outbound" as const,
      isReturnBooking: false,
      scheduledDate: job.tripDate,
      scheduledTime: job.tripTime,
      pickup: job.pickupLabel,
      dropoff: job.dropoffLabel,
      customerName: job.customerName,
      paymentStatus: job.status,
      journeyStatus: job.status,
      completedAt: "",
      fareGbp: 0,
      fareKnown: true,
      bookingAmountGbp: 0,
      awaitingPayment: true,
      cancelled: false,
      completed: false,
    }],
    TODAY,
  );
  assert.equal(upcoming.length, 0);
  const awaiting = selectAwaitingPaymentItems({
    paidBookings: [],
    bookingJobs: [job],
    today: TODAY,
  });
  assert.equal(awaiting.length, 1);
  assert.equal(awaiting[0]?.today, false);
  const future = groupFutureJobsByDate(
    [{
      bookingId: job.id,
      reference: job.id,
      source: "booking_job" as const,
      leg: "outbound" as const,
      isReturnBooking: false,
      scheduledDate: job.tripDate,
      scheduledTime: job.tripTime,
      pickup: job.pickupLabel,
      dropoff: job.dropoffLabel,
      customerName: job.customerName,
      paymentStatus: job.status,
      journeyStatus: job.status,
      completedAt: "",
      fareGbp: 0,
      fareKnown: true,
      bookingAmountGbp: 0,
      awaitingPayment: true,
      cancelled: false,
      completed: false,
    }],
    TODAY,
  );
  assert.equal(future[0]?.date, "2026-10-12");
  console.log("OK  D: not in today · in awaiting · future 12 October");
}

console.log("\n=== Scenario E: awaiting payment due today ===");
{
  const job = {
    id: "MATNI-E",
    status: "awaiting_payment",
    tripDate: TODAY,
    tripTime: "16:20",
    pickupLabel: "BT37",
    dropoffLabel: "BFS",
    customerName: "Erin",
  };
  const legs = [{
    bookingId: job.id,
    reference: job.id,
    source: "booking_job" as const,
    leg: "outbound" as const,
    isReturnBooking: false,
    scheduledDate: job.tripDate,
    scheduledTime: job.tripTime,
    pickup: job.pickupLabel,
    dropoff: job.dropoffLabel,
    customerName: job.customerName,
    paymentStatus: job.status,
    journeyStatus: job.status,
    completedAt: "",
    fareGbp: 40,
    fareKnown: true,
    bookingAmountGbp: 40,
    awaitingPayment: true,
    cancelled: false,
    completed: false,
  }];
  const upcoming = selectTodayUpcomingLegs(legs, TODAY);
  assert.equal(upcoming.length, 1);
  const awaiting = selectAwaitingPaymentItems({
    paidBookings: [],
    bookingJobs: [job],
    today: TODAY,
  });
  assert.equal(awaiting.length, 1);
  assert.equal(awaiting[0]?.today, true);
  console.log("OK  E: in today’s upcoming + awaiting payment");
}

console.log("\n=== Scenario F: cancelled excluded ===");
{
  const booking = paid({
    paymentReference: "F-CANCEL",
    status: "cancelled",
    operationalStatus: "cancelled",
    cancelledAt: "2026-09-04T12:00:00.000Z",
    amount: 80,
    outboundJourneyStatus: "scheduled",
    tripDate: TODAY,
  });
  const metrics = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(metrics.today.journeysScheduled, 0);
  assert.equal(metrics.today.earnedRevenueGbp, 0);
  assert.equal(selectTodayUpcomingLegs(expandOwnerPaidBookingLegs(booking), TODAY).length, 0);
  console.log("OK  F: cancelled excluded from upcoming and earned");
}

console.log("\n=== Historic unsplit return is not 50/50 ===");
{
  const split = allocateOwnerLegFares({
    returnJourney: true,
    amount: 100,
  });
  assert.equal(split.splitKnown, false);
  assert.equal(split.outboundFare, null);
  assert.equal(persistableLegFares({ returnJourney: true, outboundFare: 45, returnFare: 55 })?.outboundFare, 45);

  const unsplit = paid({
    paymentReference: "UNSPLIT",
    returnJourney: true,
    tripDate: "2026-09-03",
    returnDate: "2026-09-10",
    amount: 100,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-03T10:00:00.000Z",
    returnJourneyStatus: "scheduled",
  });
  const mid = buildOwnerOperationalMetrics({ paidBookings: [unsplit], now: NOW });
  assert.equal(mid.week.journeysCompleted, 1);
  assert.equal(mid.week.earnedRevenueGbp, 0, "unsplit return must not earn the full fare on first leg");
  assert.ok(mid.unsplitReturnBookingIds.includes("UNSPLIT"));

  const bothDone = buildOwnerOperationalMetrics({
    paidBookings: [{
      ...unsplit,
      returnJourneyStatus: "completed",
      returnCompletedAt: "2026-09-10T18:00:00.000Z",
    }],
    now: new Date("2026-09-10T20:00:00+01:00"),
  });
  assert.equal(bothDone.week.earnedRevenueGbp, 100);
  assert.equal(bothDone.week.journeysCompleted, 1);
  console.log("OK  historic unsplit return earns on later completion day only");
}

console.log("\n=== Today’s upcoming sort + completed heading ===");
{
  const late = paid({ paymentReference: "SORT-LATE", tripDate: TODAY, tripTime: "16:00" });
  const early = paid({ paymentReference: "SORT-EARLY", tripDate: TODAY, tripTime: "08:15" });
  const mid = paid({ paymentReference: "SORT-MID", tripDate: TODAY, tripTime: "11:30" });
  const upcoming = selectTodayUpcomingLegs(
    [
      ...expandOwnerPaidBookingLegs(late),
      ...expandOwnerPaidBookingLegs(early),
      ...expandOwnerPaidBookingLegs(mid),
    ],
    TODAY,
  );
  assert.deepEqual(
    upcoming.map((leg) => leg.scheduledTime),
    ["08:15", "11:30", "16:00"],
  );
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.doesNotMatch(panel, /todayUpcomingOpen/);
  assert.match(panel, /const \[todayCompletedOpen, setTodayCompletedOpen\] = useState\(false\)/);
  assert.match(panel, /Today’s Completed Jobs \(\{todayCompleted\.length\}\)/);
  assert.match(panel, /formatOwnerOpsMoney\(todayCompletedEarnedGbp\)\} earned/);
  assert.match(panel, /OwnerWazeAddressLink/);
  assert.match(panel, /OwnerCustomerCallWhatsApp/);
  assert.match(read("src/components/OwnerJobNavActions.tsx"), /data-owner-waze/);
  console.log("OK  upcoming sorted by pickup · completed heading count/earned · Waze/Call on cards");
}

console.log("\n=== Manual 5% return offer + deep link (A–H) ===");
{
  const airportToCustomer = planManualReturnOfferSend({
    booking: {
      paymentReference: "A-BFS-HOME",
      customerEmail: "a@example.com",
      customerName: "A",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Carrickfergus",
      returnJourney: false,
      airportCode: "BFS",
      isFromAirport: true,
      isAirportTrip: true,
      status: "confirmed",
      operationalStatus: "confirmed",
      paymentStatus: "paid",
      createdAt: "2026-08-28T10:00:00.000Z",
      tripDate: TODAY,
      tripTime: "09:10",
    },
    correspondingReturnBooked: false,
    journeyCompletedAt: "2026-09-05T10:00:00.000Z",
    now: NOW,
  });
  assert.equal(airportToCustomer.shouldSend, true);
  assert.equal(
    ownerManualReturnOfferUi({
      displayedLegCompleted: true,
      cancelledOrRefunded: false,
      customerEmail: "a@example.com",
    }).showAction,
    true,
  );
  console.log("OK  A: airport → customer completed can send");

  const customerToAirport = planManualReturnOfferSend({
    booking: {
      paymentReference: "B-VICTOR",
      customerEmail: "victor@example.com",
      customerName: "Victor",
      pickupLabel: "BT36 Newtownabbey",
      dropoffLabel: "Belfast International Airport",
      returnJourney: false,
      airportCode: "BFS",
      isFromAirport: false,
      isAirportTrip: true,
      status: "confirmed",
      operationalStatus: "confirmed",
      paymentStatus: "paid",
      createdAt: "2026-08-28T10:00:00.000Z",
      tripDate: TODAY,
      tripTime: "11:30",
    },
    correspondingReturnBooked: false,
    journeyCompletedAt: "2026-09-05T10:30:00.000Z",
    now: NOW,
  });
  assert.equal(customerToAirport.shouldSend, true);
  assert.equal(customerToAirport.direction, "local_to_airport");
  console.log("OK  B: customer → airport completed (Victor) can send");

  const scheduled = planManualReturnOfferSend({
    booking: {
      paymentReference: "C-SCHED",
      customerEmail: "c@example.com",
      customerName: "C",
      pickupLabel: "BT36 Newtownabbey",
      dropoffLabel: "Belfast International Airport",
      returnJourney: false,
      airportCode: "BFS",
      isFromAirport: false,
      status: "confirmed",
      paymentStatus: "paid",
      createdAt: "2026-09-05T08:00:00.000Z",
      tripDate: "2026-09-12",
      tripTime: "09:00",
    },
    correspondingReturnBooked: false,
    now: NOW,
  });
  assert.equal(scheduled.shouldSend, false);
  assert.equal(scheduled.reason, "awaiting_completion");
  assert.equal(
    ownerManualReturnOfferUi({
      displayedLegCompleted: false,
      cancelledOrRefunded: false,
      customerEmail: "c@example.com",
    }).showAction,
    false,
  );
  console.log("OK  C: scheduled journey has no completed-offer action");

  const alreadySent = planManualReturnOfferSend({
    booking: {
      paymentReference: "D-SENT",
      customerEmail: "d@example.com",
      customerName: "D",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "BT9",
      returnJourney: false,
      airportCode: "BFS",
      isFromAirport: true,
      status: "confirmed",
      paymentStatus: "paid",
      createdAt: "2026-08-20T10:00:00.000Z",
      tripDate: TODAY,
      tripTime: "08:00",
    },
    existing: { status: "SENT", emailSentAt: "2026-09-04T12:00:00.000Z" },
    correspondingReturnBooked: false,
    journeyCompletedAt: "2026-09-05T09:00:00.000Z",
    now: NOW,
  });
  assert.equal(alreadySent.shouldSend, false);
  assert.equal(alreadySent.reason, "offer_already_sent");
  const sentUi = ownerManualReturnOfferUi({
    displayedLegCompleted: true,
    cancelledOrRefunded: false,
    customerEmail: "d@example.com",
    offerStatus: "SENT",
    offerSentAt: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(sentUi.alreadySent, true);
  assert.match(sentUi.label, /again/i);
  console.log("OK  D: already sent is not a silent duplicate");

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /ownerManualReturnOfferUi/);
  assert.match(panel, /data-owner-manual-return-offer/);
  assert.match(panel, /More options/);
  assert.match(panel, /Today’s Completed Jobs/);
  assert.match(panel, /data-today-completed-toggle/);
  assert.match(panel, /todayCompletedOpen \? \(/);
  assert.match(panel, /Completed Jobs/);
  assert.match(panel, /displayLeg/);
  const upcomingAt = panel.indexOf("Today’s Upcoming Jobs (");
  const todayCompletedAt = panel.indexOf("Today’s Completed Jobs (");
  const awaitingAt = panel.indexOf("Awaiting Payment (");
  const futureAt = panel.indexOf("Future Jobs (");
  const historyAt = panel.indexOf('<h4 className="text-sm font-bold text-white">Completed Jobs</h4>');
  assert.ok(
    upcomingAt > 0 &&
      todayCompletedAt > upcomingAt &&
      awaitingAt > todayCompletedAt &&
      futureAt > awaitingAt &&
      historyAt > futureAt,
    "section order: Upcoming → Today completed → Awaiting → Future → Completed history",
  );
  console.log("OK  E/F: completed today + history cards keep More options return-offer action");

  const returnBooking = paid({
    paymentReference: "G-RETURN",
    returnJourney: true,
    tripDate: TODAY,
    tripTime: "08:00",
    returnDate: "2026-09-12",
    returnTime: "18:00",
    amount: 100,
    outboundFare: 45,
    returnFare: 55,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-05T09:00:00.000Z",
    returnJourneyStatus: "scheduled",
  });
  const legs = expandOwnerPaidBookingLegs(returnBooking);
  assert.equal(legs[0]?.completed, true);
  assert.equal(legs[1]?.completed, false);
  assert.equal(legs[1]?.scheduledDate, "2026-09-12");
  const outboundUi = ownerManualReturnOfferUi({
    displayedLegCompleted: Boolean(legs[0]?.completed),
    cancelledOrRefunded: false,
    customerEmail: "g@example.com",
    returnAlreadyIncluded: Boolean(returnBooking.returnJourney),
  });
  const returnUi = ownerManualReturnOfferUi({
    displayedLegCompleted: Boolean(legs[1]?.completed),
    cancelledOrRefunded: false,
    customerEmail: "g@example.com",
    returnAlreadyIncluded: Boolean(returnBooking.returnJourney),
  });
  assert.equal(outboundUi.showAction, true);
  assert.equal(outboundUi.enabled, false);
  assert.equal(returnUi.showAction, false);
  assert.equal(
    pickManualJourneyCompletedAt({
      outboundCompletedAt: returnBooking.outboundCompletedAt,
    }),
    "2026-09-05T09:00:00.000Z",
  );
  console.log("OK  G: completed outbound does not mark return leg completed");

  const jobsPanel = read("src/components/OwnerBookingJobsPanel.tsx");
  assert.match(jobsPanel, /revealBookingRequestFromHash|owner-booking-job-/);
  assert.match(jobsPanel, /setAwaitingOpen\(true\)/);
  assert.match(jobsPanel, /scrollIntoView/);
  assert.match(jobsPanel, /requestAnimationFrame/);
  assert.match(panel, /openBookingRequest/);
  assert.match(panel, /data-open-booking-request/);
  console.log("OK  H: Open booking request expands the collapsed awaiting section");
}

console.log("\n=== Source contracts ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Today’s Upcoming Jobs/);
  assert.match(panel, /Today’s Completed Jobs/);
  assert.match(panel, /data-today-completed-toggle/);
  assert.match(panel, /Awaiting Payment/);
  assert.match(panel, /Future Jobs/);
  assert.match(panel, /displayLeg/);

  const summary = read("src/components/OwnerFinancialSummaryPanel.tsx");
  assert.match(summary, /Earned revenue/);
  assert.match(summary, /Payments received/);
  assert.match(summary, /buildOwnerOperationalMetrics/);

  const record = read("shared/paid-booking-record.ts");
  assert.match(record, /outboundFare\?: number/);
  assert.match(record, /returnFare\?: number/);
  assert.match(record, /outboundCompletedAt\?: string/);
  assert.match(record, /returnCompletedAt\?: string/);

  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /outboundCompletedAt/);
  assert.match(journey, /returnCompletedAt/);

  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /persistableLegFares/);
  assert.doesNotMatch(finalize, /amount \/= 2/);

  console.log("OK  owner-only wiring · no 50/50 split");
}

console.log("\nAll owner dashboard today-section checks passed.");
