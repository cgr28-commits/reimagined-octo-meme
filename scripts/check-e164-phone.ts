import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toE164, whatsAppDigitsFor } from "../shared/phone-e164";
import { ownerWhatsAppDigits, ownerCustomerContactActions } from "../shared/owner-job-actions";
import { whatsAppHrefForMobile } from "../shared/journey-tip";
import { toWhatsAppDigits } from "../shared/arrival-whatsapp";
import { whatsAppRecipient } from "../workers/addresses/src/whatsapp-templates";
import { savePaidBookingRecord, getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { saveBookingJob, getBookingJob } from "../workers/addresses/src/booking-job-store";
import { toDispatchBooking } from "../workers/addresses/src/driver-jobs-wiring";

const cases: Array<[string, string]> = [
  ["07700 900123", "+447700900123"], ["+44 7700 900123", "+447700900123"], ["+44 (0)7700 900123", "+447700900123"],
  ["0044 7700 900123", "+447700900123"], ["447700900123", "+447700900123"],
  ["087 123 4567", "+353871234567"], ["+353 87 123 4567", "+353871234567"], ["+353 (0)87 123 4567", "+353871234567"], ["00353871234567", "+353871234567"],
  ["+1 415 555 2671", "+14155552671"], ["+49 151 23456789", "+4915123456789"], ["+33 6 12 34 56 78", "+33612345678"],
  ["+34 612 345 678", "+34612345678"], ["+61 412 345 678", "+61412345678"], ["+31 6 12345678", "+31612345678"],
];
for (const [input, want] of cases) {
  assert.equal(toE164(input), want, `toE164(${input})`);
  assert.equal(ownerWhatsAppDigits(input), want.slice(1), `owner link digits ${input}`);
  assert.equal(whatsAppRecipient(input), want.slice(1), `WhatsApp template recipient ${input}`);
  assert.equal(toWhatsAppDigits(input), want.slice(1), `arrival/pay WhatsApp ${input}`);
  assert.ok(whatsAppHrefForMobile(input, "Hi")!.startsWith(`https://wa.me/${want.slice(1)}?text=`), `journey link ${input}`);
}
for (const bad of ["", "abc", "12345", "+0000", "+1 23"]) assert.equal(toE164(bad), "", `rejects ${JSON.stringify(bad)}`);
assert.equal(whatsAppDigitsFor("junk", "+353871234567"), "353871234567", "stored E.164 preferred");
assert.equal(ownerCustomerContactActions("087 123 4567")!.telHref, "tel:+353871234567");

const mem = new Map<string, string>();
const kv = {
  get: async (k: string, t?: string) => { const v = mem.get(k); return v === undefined ? null : t === "json" ? JSON.parse(v) : v; },
  put: async (k: string, v: string) => { mem.set(k, v); }, delete: async (k: string) => { mem.delete(k); },
  list: async () => ({ keys: [], list_complete: true }),
} as unknown as KVNamespace;

(async () => {
  const rec: any = { paymentReference: "P1", status: "paid", mobileNumber: "087 123 4567", tripDate: "2027-01-01", tripTime: "10:00", customerEmail: "a@b.test", customerName: "A", checkoutId: "", trackingToken: "t" };
  await savePaidBookingRecord(kv, rec);
  const back: any = await getPaidBookingRecord(kv, "P1");
  assert.equal(back.mobileNumber, "087 123 4567", "original number preserved exactly as typed");
  assert.equal(back.mobileE164, "+353871234567", "validated E.164 stored beside it");
  rec.mobileNumber = "not a number";
  await savePaidBookingRecord(kv, rec);
  assert.equal(((await getPaidBookingRecord(kv, "P1")) as any).mobileE164, undefined, "no stale E.164 when the number is invalid");

  const job: any = { id: "P1", paymentReference: "P1", customerMobile: "+1 415 555 2671", tripDate: "2027-01-01", tripTime: "10:00", pickupLabel: "a", dropoffLabel: "b", returnJourney: false, status: "paid" };
  await saveBookingJob(kv, job);
  const j = (await getBookingJob(kv, "P1"))!;
  assert.equal(j.customerMobile, "+1 415 555 2671");
  assert.equal(j.customerMobileE164, "+14155552671");
  assert.equal(toDispatchBooking(j).customerMobile, "+14155552671", "driver receives the international number");
  assert.equal(toDispatchBooking({ ...j, customerMobileE164: undefined } as any).customerMobile, "+1 415 555 2671", "falls back to the entered number");
  // Amendments: the sync helper re-saves via saveBookingJob, so a changed number re-derives E.164.
  const { syncBookingJobFromAmendment } = await import("../workers/addresses/src/booking-job-sync");
  await syncBookingJobFromAmendment(kv, { paymentReference: "P1" }, { mobileNumber: "+353 87 765 4321" });
  assert.equal((await getBookingJob(kv, "P1"))!.customerMobileE164, "+353877654321");
  const src = readFileSync("workers/addresses/src/short-notice-handlers.ts", "utf8");
  assert.ok(src.includes("toWhatsAppDigits(record.booking.mobileNumber)"), "owner pay link uses international digits");
  console.log("PASS E.164 normalisation, storage, owner/driver/customer link parity");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
