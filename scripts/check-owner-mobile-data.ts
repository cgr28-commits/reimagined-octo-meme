/**
 * Checks for the mobile Owner Dashboard data helpers (no network, no live data).
 *   npx tsx scripts/check-owner-mobile-data.ts
 */
import assert from "node:assert/strict";
import {
  buildCustomerDirectory,
  buildHomeSummary,
  buildMessageItems,
  formatCountdown,
  minutesUntilPickup,
  whatsAppLink,
  type MobilePaidBooking,
} from "../src/components/owner-mobile/owner-mobile-data";

// 10 Nov 2026, 16:00 London (GMT, so 16:00Z).
const now = new Date("2026-11-10T16:00:00Z");

const booking = (overrides: Partial<MobilePaidBooking>): MobilePaidBooking => ({
  paymentReference: "MAT-1",
  createdAt: "2026-11-01T10:00:00Z",
  status: "paid",
  customerName: "Sarah McAllister",
  customerEmail: "sarah@example.com",
  mobileNumber: "07700 900123",
  pickupLabel: "Belfast International Airport",
  dropoffLabel: "Glengormley BT36",
  tripDate: "2026-11-10",
  tripTime: "17:40",
  amount: 68,
  amountPaid: "£68.00",
  ...overrides,
});

const bookings: MobilePaidBooking[] = [
  booking({}),
  booking({ paymentReference: "MAT-2", customerName: "Declan", customerEmail: "d@example.com", mobileNumber: "", tripTime: "06:15", journeyStatus: "completed", journeyCompletedAt: "2026-11-10T07:05:00Z", amount: 45, amountPaid: "£45.00" }),
  booking({ paymentReference: "MAT-3", customerName: "James", customerEmail: "j@example.com", mobileNumber: "07700 900999", tripTime: "22:30", status: "awaiting_payment", amount: 92, amountPaid: "£92.00" }),
  booking({ paymentReference: "MAT-4", customerName: "Cancelled Person", customerEmail: "c@example.com", mobileNumber: "", tripTime: "12:00", status: "cancelled", cancelledAt: "2026-11-09T10:00:00Z" }),
  // Same person as MAT-1 by mobile number, different email: must merge into one customer.
  booking({ paymentReference: "MAT-0", customerEmail: "sarah.work@example.com", mobileNumber: "+44 7700 900123", tripDate: "2026-08-14", tripTime: "09:00", amount: 135, amountPaid: "£135.00", amountRefunded: 10 }),
];

// Countdown maths in London time.
assert.equal(minutesUntilPickup({ scheduledDate: "2026-11-10", scheduledTime: "17:40" }, now), 100);
assert.equal(formatCountdown(100), "in 1 h 40 min");
// Summer time (BST): 17:40 London on 10 Jul = 16:40Z.
assert.equal(minutesUntilPickup({ scheduledDate: "2026-07-10", scheduledTime: "17:40" }, new Date("2026-07-10T16:00:00Z")), 40);

const summary = buildHomeSummary({
  bookings,
  shortNotice: [
    { reference: "SN-1", status: "SHORT_NOTICE_AWAITING_APPROVAL", shortNoticeExpiresAt: "2026-11-10T16:18:00Z", booking: { customerName: "Ann", tripDate: "2026-11-11", tripTime: "05:10", pickupLabel: "A", dropoffLabel: "B" } },
    { reference: "SN-2", status: "SHORT_NOTICE_AWAITING_APPROVAL", shortNoticeExpiresAt: "2026-11-10T15:00:00Z", booking: { customerName: "Expired", tripDate: "2026-11-11", tripTime: "05:10", pickupLabel: "A", dropoffLabel: "B" } },
    { reference: "SN-3", status: "SHORT_NOTICE_PAID", booking: { customerName: "Done", tripDate: "2026-11-11", tripTime: "05:10", pickupLabel: "A", dropoffLabel: "B" } },
  ],
  threads: [
    { threadKey: "t1", counterpartEmail: "sarah@example.com", counterpartName: "Sarah", subject: "Re: MAT-1", lastAt: "2026-11-10T15:42:00Z", lastSnippet: "Hi", lastDirection: "in", unread: 1, archived: false, bookingRef: "MAT-1" },
    { threadKey: "t2", counterpartEmail: "x@example.com", subject: "Old", lastAt: "2026-11-01T10:00:00Z", lastSnippet: "Thanks", lastDirection: "out", unread: 0, archived: false },
    { threadKey: "t3", counterpartEmail: "y@example.com", subject: "Archived", lastAt: "2026-11-10T15:59:00Z", lastSnippet: "?", lastDirection: "in", unread: 1, archived: true },
  ],
  chats: [
    { phone: "447700900456", name: "Paul", updatedAt: "2026-11-10T15:45:00Z", lastText: "Can you do 5 people?", lastFrom: "customer" },
    { phone: "447700900789", name: "Niamh", updatedAt: "2026-11-08T10:00:00Z", lastText: "Is the price the same?", lastFrom: "customer" },
    { phone: "447700900111", name: "Done", updatedAt: "2026-11-10T12:00:00Z", lastText: "Thanks!", lastFrom: "team" },
  ],
  now,
});

assert.equal(summary.today, "2026-11-10");
assert.equal(summary.nextPickup?.reference, "MAT-1", "next pickup is the 17:40, not the completed 06:15");
assert.deepEqual(summary.todayLegs.map((leg) => leg.scheduledTime), ["06:15", "17:40", "22:30"], "cancelled booking left out");
assert.equal(summary.todayCompletedCount, 1);
assert.equal(summary.earnedTodayGbp, 45, "only the completed journey counts as earned");
const urgentIds = summary.urgent.map((item) => item.id);
assert.ok(urgentIds.includes("sn:SN-1"));
assert.ok(!urgentIds.includes("sn:SN-2"), "expired request not shown");
assert.ok(!urgentIds.includes("sn:SN-3"));
assert.ok(urgentIds.includes("email:t1"));
assert.ok(!urgentIds.includes("email:t3"), "archived thread ignored");
assert.ok(urgentIds.includes("whatsapp:447700900456"));
assert.ok(urgentIds.includes("unpaid:MAT-3"));
assert.equal(summary.urgent.find((i) => i.id === "sn:SN-1")?.badge, "18 min");
assert.equal(summary.unreadMessages, 3, "Sarah's email + Paul + Niamh");

const items = buildMessageItems(
  [],
  [
    { phone: "447700900456", updatedAt: "2026-11-10T15:45:00Z", lastText: "x", lastFrom: "customer" },
    { phone: "447700900789", updatedAt: "2026-11-08T10:00:00Z", lastText: "y", lastFrom: "customer" },
  ],
  now,
);
assert.equal(items[0].replyWindowClosesAt, "2026-11-11T15:45:00.000Z");
assert.equal(items[1].replyWindowClosesAt, null, "older than 24h: window closed");

const customers = buildCustomerDirectory(bookings, "2026-11-10");
const sarah = customers.find((c) => c.name === "Sarah McAllister");
assert.ok(sarah);
assert.equal(sarah.bookings.length, 2, "merged by mobile number");
assert.equal(sarah.totalSpendGbp, 68 + 135 - 10);
assert.equal(sarah.upcomingCount, 1);
const james = customers.find((c) => c.name === "James");
assert.equal(james?.totalSpendGbp, 0, "unpaid booking not counted as spend");

assert.equal(whatsAppLink("07549 815538"), "https://wa.me/447549815538");
assert.equal(whatsAppLink(""), null);

console.log("owner mobile data checks passed");
