/**
 * Owner Dashboard front screen "Needs your attention" list.
 * Run: npx tsx scripts/check-owner-attention.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { a2aAttention, bespokeAttention, shortNoticeAttention, sortAttention } from "../src/components/OwnerAttentionPanel";

const now = Date.parse("2026-11-14T12:00:00Z");
const iso = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

// Short notice: only bookings still awaiting a decision, not removed, not past the reply window.
const sn = shortNoticeAttention(
  [
    { reference: "SN-1", status: "SHORT_NOTICE_AWAITING_APPROVAL", shortNoticeExpiresAt: iso(30), amountLabel: "£60.00", booking: { customerName: "Ann Lee", tripDate: "2026-11-14", tripTime: "15:00", pickupLabel: "Lisburn", dropoffLabel: "BFS" } },
    { reference: "SN-2", status: "SHORT_NOTICE_AWAITING_APPROVAL", shortNoticeExpiresAt: iso(-5), booking: {} },
    { reference: "SN-3", status: "SHORT_NOTICE_APPROVED", booking: {} },
    { reference: "SN-4", status: "SHORT_NOTICE_AWAITING_APPROVAL", removedFromDashboardAt: iso(-60), booking: {} },
    { reference: "SN-5", status: "SHORT_NOTICE_AWAITING_APPROVAL", shortNoticeExpiresAt: iso(10), booking: { customerName: "Bob" } },
  ] as never,
  now,
);
assert.deepEqual(sn.map((i) => i.reference).sort(), ["SN-1", "SN-5"], "expired, approved and removed short-notice rows are left out");
assert.ok(sn.every((i) => i.urgent && i.action === "Approve or decline"));
assert.match(sn.find((i) => i.reference === "SN-1")!.deadlineLabel ?? "", /^Reply by \d{2}:\d{2}$/);

// A2A: only quotes waiting for the owner's price.
const a2a = a2aAttention([
  { reference: "A2A-1", status: "AWAITING_QUOTE", customerName: "Cara", tripDate: "2026-12-01", tripTime: "09:00", tripLabel: "Newry → Derry", vehicle: "Saloon" },
  { reference: "A2A-2", status: "QUOTE_APPROVED_AWAITING_PAYMENT", customerName: "Dan", tripDate: "2026-12-02", tripTime: "09:00" },
  { reference: "A2A-3", status: "PAID", customerName: "Eve", tripDate: "2026-12-03", tripTime: "09:00" },
] as never);
assert.deepEqual(a2a.map((i) => i.reference), ["A2A-1"], "quotes waiting on the customer are not the owner's job");
assert.equal(a2a[0].action, "Needs a price");

// Event / Business Class: needs a price, or a payment decision. Never while it waits on the customer.
const base = { createdAt: "x", updatedAt: "x", customerLabel: "Jane D.", date: "2026-12-10", time: "18:00", passengers: 4, reviewOpen: false };
const bq = bespokeAttention([
  { ...base, reference: "BQ-NEW", category: "event", status: "NEW", eventTitle: "Arena concert" },
  { ...base, reference: "BQ-REV", category: "business_class", status: "REVIEWING", serviceType: "corporate" },
  { ...base, reference: "BQ-QUOTED", category: "event", status: "QUOTED" },
  { ...base, reference: "BQ-PAYING", category: "event", status: "PAYMENT_STARTED" },
  { ...base, reference: "BQ-DONE", category: "event", status: "CONFIRMED" },
  { ...base, reference: "BQ-REVIEW", category: "event", status: "PAYMENT_REVIEW" },
  { ...base, reference: "BQ-REFUND", category: "event", status: "REFUND_REQUIRED" },
  { ...base, reference: "BQ-FLAG", category: "event", status: "CONFIRMED", reviewOpen: true },
  { ...base, reference: "BQ-DECLINED", category: "event", status: "DECLINED" },
] as never);
assert.deepEqual(bq.map((i) => i.reference).sort(), ["BQ-FLAG", "BQ-NEW", "BQ-REFUND", "BQ-REV", "BQ-REVIEW"]);
assert.equal(bq.find((i) => i.reference === "BQ-NEW")!.typeLabel, "Event transfer");
assert.equal(bq.find((i) => i.reference === "BQ-REV")!.title, "Corporate travel");
assert.equal(bq.find((i) => i.reference === "BQ-REFUND")!.action, "Refund needed");
assert.ok(bq.find((i) => i.reference === "BQ-REVIEW")!.urgent);
assert.ok(!bq.some((i) => /jane doe|@|07\d{9}/i.test(JSON.stringify(i))), "only the minimised customer label is shown for these");

// Order: short notice (soonest reply deadline) → payment decisions → the rest by journey date.
const order = sortAttention([...a2a, ...bq, ...sn]).map((i) => i.reference);
assert.deepEqual(order.slice(0, 2), ["SN-5", "SN-1"], "soonest short-notice deadline first");
assert.ok(order.indexOf("BQ-REFUND") < order.indexOf("A2A-1") && order.indexOf("BQ-REVIEW") < order.indexOf("BQ-NEW"), "payment decisions before pricing work");
assert.ok(order.indexOf("A2A-1") < order.indexOf("BQ-NEW"), "then earliest journey first");

// Wiring: on the front screen, read-only, and the existing panels are untouched.
const page = readFileSync("src/app/driver/DriverPageClient.tsx", "utf8");
assert.match(page, /ownerToolTab === "jobs" && !mobileLayout \? \(\s*<OwnerAttentionPanel ownerKey=\{savedKey\} onOpen=\{openAttentionItem\} \/>/, "shown on the dashboard front screen");
assert.ok(page.indexOf("<OwnerAttentionPanel") < page.indexOf('<header className={mobileLayout ? "hidden" : "mb-8"}>'), "it sits above the page heading and tabs, so no scrolling is needed");
assert.equal(page.match(/<OwnerAttentionPanel/g)?.length, 1, "shown once");
assert.match(page, /`a2a-validity-\$\{item\.reference\}`/);
assert.match(page, /`approve-short-notice-\$\{item\.reference\}`/);
assert.ok(readFileSync("src/components/OwnerA2aQuotesPanel.tsx", "utf8").includes("id={`a2a-validity-${quote.reference}`}"), "A2A card anchor still exists");
assert.ok(readFileSync("src/components/OwnerShortNoticePanel.tsx", "utf8").includes("id={`approve-short-notice-${booking.reference}`}"), "short-notice card anchor still exists");
const panel = readFileSync("src/components/OwnerAttentionPanel.tsx", "utf8");
assert.ok(!/method:\s*"POST"|postOwner|approve\w*\(|decline\w*\(/.test(panel), "the list only reads and links; it never approves, prices or pays");
console.log("Owner attention list checks passed.");
