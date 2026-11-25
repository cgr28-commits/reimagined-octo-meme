import { syncBookingJobFromAmendment } from "../workers/addresses/src/booking-job-sync";
import { saveBookingJob, getBookingJob } from "../workers/addresses/src/booking-job-store";
import { readFileSync } from "node:fs";

const mem = new Map<string, string>();
const kv = {
  get: async (k: string, t?: string) => { const v = mem.get(k); return v === undefined ? null : t === "json" ? JSON.parse(v) : v; },
  put: async (k: string, v: string) => { mem.set(k, v); },
  delete: async (k: string) => { mem.delete(k); },
  list: async () => ({ keys: [], list_complete: true }),
} as unknown as KVNamespace;

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };

(async () => {
  const base: any = {
    id: "PAY1", paymentReference: "PAY1", status: "confirmed", customerName: "A B", customerMobile: "+353871234567",
    tripLabel: "x", pickupLabel: "Belfast Cruise Terminal", dropoffLabel: "Belfast", returnJourney: false,
    tripDate: "2027-05-01", tripTime: "09:00", passengers: 2, suitcases: 2, vehicle: "Saloon", isAirportTrip: false,
    sailingDetails: "MSC Virtuosa", portPickupNote: "Meet at Port Pass gate",
    driverAccountId: "d1", driverEmail: "driver@example.test", driverFirstName: "Sam", driverAssignmentStatus: "accepted",
  };
  await saveBookingJob(kv, base);
  const sent: string[] = [];
  const notify = async (_d: any, s: string, b: string) => { sent.push(s + "|" + b); };
  const ref = { paymentReference: "PAY1" };

  let r = await syncBookingJobFromAmendment(kv, ref, { sailingDetails: "Celebrity Silhouette" }, notify);
  ok(r.found && r.changed.join() === "sailingDetails" && r.driverNotified, "ship change updates the job and notifies driver once");
  ok((await getBookingJob(kv, "PAY1"))?.sailingDetails === "Celebrity Silhouette", "job record carries new ship name");
  ok(sent.length === 1 && sent[0].includes("MSC Virtuosa") && sent[0].includes("Celebrity Silhouette"), "email shows was/now");

  r = await syncBookingJobFromAmendment(kv, ref, { sailingDetails: "Celebrity Silhouette" }, notify);
  ok(r.changed.length === 0 && !r.driverNotified && sent.length === 1, "repeat save is a no-op (no duplicate alert)");

  r = await syncBookingJobFromAmendment(kv, ref, { portPickupNote: "Meet at terminal door B" }, notify);
  ok(r.driverNotified && sent.length === 2, "pickup instruction change reaches driver");

  r = await syncBookingJobFromAmendment(kv, ref, { tripTime: "10:30" }, notify);
  ok(r.changed.join() === "tripTime" && !r.driverNotified && sent.length === 2, "time change updates job; driver is asked via existing change-request flow, not a second email");

  r = await syncBookingJobFromAmendment(kv, { paymentReference: "NOPE" }, { sailingDetails: "X" }, notify);
  ok(!r.found && mem.size >= 1 && ![...mem.keys()].some((k) => k.includes("NOPE")), "missing job is never created (no duplicate jobs)");

  await saveBookingJob(kv, { ...base, id: "PAY2", paymentReference: "PAY2", driverAssignmentStatus: "unassigned", driverEmail: undefined });
  r = await syncBookingJobFromAmendment(kv, { paymentReference: "PAY2" }, { sailingDetails: "New ship" }, notify);
  ok(r.changed.includes("sailingDetails") && !r.driverNotified, "unassigned job updated silently");

  const src = (f: string) => readFileSync(f, "utf8");
  ok(src("workers/addresses/src/booking-amendment-handlers.ts").includes("syncBookingJobFromAmendment("), "customer amendment wired");
  ok(src("workers/addresses/src/amendment-topup.ts").includes("syncBookingJobFromAmendment(") && src("workers/addresses/src/amendment-topup.ts").includes("sailingDetails: newSailingDetails"), "paid top-up amendment wired and now applies sailing details");
  ok(src("workers/addresses/src/paid-booking-edit-handlers.ts").includes("syncBookingJobFromAmendment(") && src("workers/addresses/src/paid-booking-edit-handlers.ts").includes("fields.portPickupNote"), "owner edit wired incl. pickup note");
  process.exit(fail ? 1 : 0);
})();
