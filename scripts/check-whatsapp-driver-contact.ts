/** "Where's my driver?" on WhatsApp: detection, journey matching and the reply. */
import assert from "node:assert/strict";
import {
  buildWhatsAppDriverContactReply,
  formatUkMobileForDisplay,
  isWhatsAppDriverContactQuestion,
  pickDriverContactJob,
  resolveWhatsAppDriverContact,
} from "../shared/whatsapp-driver-contact";
import type { TrackingJobRecord } from "../shared/tracking";

for (const q of [
  "Where is my driver?",
  "wheres my taxi",
  "Where’s the driver",
  "Can I have the driver's number please",
  "drivers phone number?",
  "how do I contact my driver",
  "my driver hasn't arrived",
  "taxi still not here",
  "is the driver on the way?",
  "no sign of the taxi",
  "driver running late?",
]) {
  assert.equal(isWhatsAppDriverContactQuestion(q), true, q);
}
for (const q of [
  "Where do I meet the driver at the airport?",
  "Do your drivers wait if my flight is late?",
  "BT9 6AA to Belfast International tomorrow 5am",
  "How much is a taxi to Dublin",
]) {
  assert.equal(isWhatsAppDriverContactQuestion(q), false, q);
}

const now = new Date("2026-10-29T08:00:00Z");
const job = (over: Partial<TrackingJobRecord>): TrackingJobRecord =>
  ({
    token: "t1",
    createdAt: "2026-10-20T10:00:00Z",
    customerName: "Sarah Jones",
    customerMobile: "07700 900123",
    pickupLabel: "12 Main Street, Lisburn BT28 1AA",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-10-29",
    tripTime: "09:30",
    pickupAt: "2026-10-29T09:30:00Z",
    sharingActive: false,
    ...over,
  }) as TrackingJobRecord;

const jobs = [
  job({ token: "other", customerMobile: "07700 111222" }),
  job({ token: "done", pickupAt: "2026-10-29T06:00:00Z", journeyStatus: "completed" }),
  job({ token: "later", pickupAt: "2026-10-29T20:00:00Z" }),
  job({ token: "next" }),
  job({ token: "old", pickupAt: "2026-10-28T20:00:00Z" }),
];
assert.equal(pickDriverContactJob(jobs, "447700900123", now)?.token, "next");
assert.equal(pickDriverContactJob(jobs, "447700999999", now), null, "never another customer's journey");

const owner = { displayName: "Colin Smith", mobile: "+447777123456" };
assert.deepEqual(resolveWhatsAppDriverContact(job({}), owner), { name: "Colin", mobile: "+447777123456" });
assert.deepEqual(
  resolveWhatsAppDriverContact(job({ assignmentStatus: "pending", assignedDriverName: "John", assignedDriverMobile: "07700900555" }), owner),
  { name: "Colin", mobile: "+447777123456" },
  "pending assignment: owner still drives",
);
const assigned = resolveWhatsAppDriverContact(
  job({ assignmentStatus: "accepted", assignedDriverName: "John Doe", assignedDriverMobile: "07700900555" }),
  owner,
);
assert.deepEqual(assigned, { name: "John", mobile: "07700900555" });

assert.equal(formatUkMobileForDisplay("+447777123456"), "07777 123456");
const text = buildWhatsAppDriverContactReply(job({ flightNumber: "EZY123" }), assigned);
assert.match(text, /Your driver is \*John\*/);
assert.match(text, /07700 900555/);
assert.match(text, /09:30 from 12 Main Street \(flight EZY123\)/);

console.log("All WhatsApp driver contact checks passed.");
