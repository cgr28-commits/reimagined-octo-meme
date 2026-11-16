/**
 * Checks for: owner "Send a price" email link + Website requests grouping.
 *   npx tsx scripts/check-owner-request-price-link.ts
 */
import assert from "node:assert/strict";
import { groupOwnerRequests } from "../shared/owner-request-groups";
import type { BookingJobRecord } from "../shared/booking-job";
import {
  ownerRequestLinkExpiry,
  ownerRequestPriceUrl,
  verifyOwnerRequestToken,
} from "../workers/addresses/src/owner-request-link";
import { signOwnerApprovalToken } from "../workers/addresses/src/owner-approval-alert";
import { buildHomeSummary } from "../src/components/owner-mobile/owner-mobile-data";

const base: BookingJobRecord = {
  id: "a",
  createdAt: "2026-11-15T09:59:00Z",
  status: "awaiting_payment",
  kind: "vehicle-enquiry",
  customerName: "Test Customer",
  customerEmail: "test@example.com",
  customerMobile: "",
  tripLabel: "Airport drop-off",
  pickupLabel: "Belfast",
  dropoffLabel: "Dublin Airport",
  returnJourney: true,
  tripDate: "2027-07-09",
  tripTime: "10:30",
  passengers: 7,
  suitcases: 4,
  vehicle: "Minibus (5–7 passengers)",
  isAirportTrip: true,
};
const job = (patch: Partial<BookingJobRecord>): BookingJobRecord => ({ ...base, ...patch });

async function main() {
  const today = "2026-11-15";
  const jobs = [
    job({ id: "old-new", createdAt: "2026-11-01T10:00:00Z", tripDate: "2026-12-11" }),
    job({ id: "newest", createdAt: "2026-11-15T09:59:00Z" }),
    job({ id: "past", tripDate: "2026-10-25", createdAt: "2026-10-20T10:00:00Z" }),
    job({ id: "past-sent", tripDate: "2026-11-04", sentQuoteAt: "2026-11-01T10:00:00Z" }),
    job({ id: "sent", tripDate: "2027-04-27", sentQuoteAt: "2026-11-10T10:00:00Z" }),
    job({ id: "paid", status: "paid", tripDate: "2026-11-20" }),
    job({ id: "cancelled", status: "cancelled" }),
    job({ id: "today", tripDate: today, createdAt: "2026-11-14T10:00:00Z" }),
  ];
  const g = groupOwnerRequests(jobs, today);
  assert.deepEqual(g.new.map((j) => j.id), ["newest", "today", "old-new"], "new: newest first, trip today counts");
  assert.deepEqual(g.priceSent.map((j) => j.id), ["sent"]);
  assert.deepEqual(g.booked.map((j) => j.id), ["paid"]);
  assert.deepEqual(g.past.map((j) => j.id).sort(), ["past", "past-sent"]);
  console.log("ok  grouping");

  const summary = buildHomeSummary({
    bookings: [],
    shortNotice: [],
    threads: [],
    chats: [],
    requests: jobs,
    now: new Date("2026-11-15T10:05:00Z"),
  });
  const reqItems = summary.urgent.filter((i) => i.kind === "request");
  assert.equal(reqItems.length, 3);
  assert.equal(reqItems[0].target.tab, "enquiries");
  assert.equal(reqItems[0].target.ref, "newest");
  assert.equal(reqItems[0].title, "Test Customer");
  assert.match(reqItems[0].detail, /^New request · 09\/07 10:30 · Minibus/);
  console.log("ok  Home 'Needs you now':", reqItems[0].title, "|", reqItems[0].detail);

  const env = { OWNER_ACCESS_KEY: "test-owner-key-1234567890abcdef" };
  const now = new Date("2026-11-15T10:00:00Z");
  const url = await ownerRequestPriceUrl(env, { id: "newest", tripDate: "2027-07-09" }, now);
  assert.ok(url && url.startsWith("https://www.myairporttaxini.co.uk/owner/price/?t="));
  assert.ok(!url.includes(env.OWNER_ACCESS_KEY), "owner key never in URL");
  const token = decodeURIComponent(url.split("t=")[1]);
  const ok = await verifyOwnerRequestToken(env, token, now);
  assert.deepEqual(ok, { ok: true, jobId: "newest" });
  console.log("ok  signed link verifies for its own job");

  const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
  assert.equal((await verifyOwnerRequestToken(env, tampered, now)).ok, false);
  assert.equal((await verifyOwnerRequestToken({ OWNER_ACCESS_KEY: "another-key-xxxxxxxxxxxxxxxx" }, token, now)).ok, false);
  console.log("ok  tampered / wrong-key links rejected");

  // A short-notice approval token (reference MATNI-…) must not open the price page.
  const snToken = await signOwnerApprovalToken(env, "MATNI-1060", "2027-01-01T00:00:00Z");
  assert.equal((await verifyOwnerRequestToken(env, snToken!, now)).ok, false);
  console.log("ok  approval-link tokens can't be reused as price links");

  // Expiry: day after the trip; at least 2 days; expired link refused.
  assert.equal(ownerRequestLinkExpiry({ tripDate: "2027-07-09" }, now), "2027-07-10T23:59:59.000Z");
  assert.equal(ownerRequestLinkExpiry({ tripDate: "2026-11-15" }, now), "2026-11-17T10:00:00.000Z");
  const late = await verifyOwnerRequestToken(env, token, new Date("2027-07-11T00:00:00Z"));
  assert.equal(late.ok, false);
  assert.match((late as { error: string }).error, /expired/);
  console.log("ok  expiry");

  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
