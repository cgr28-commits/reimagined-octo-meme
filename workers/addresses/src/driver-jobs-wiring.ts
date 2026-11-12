/**
 * Connects Stage 2 driver jobs to the rest of the Worker: bookings, customer email,
 * owner phone notifications and driver email. Only used where DRIVER_DB exists (staging).
 */
import type { BookingJobRecord } from "../shared/booking-job";
import { getBookingJob, listAllBookingJobs, saveBookingJob } from "./booking-job-store";
import { sendCustomerDriverDetailsOnAccept } from "./customer-driver-details";
import type { AssignedDriver, DispatchBooking, DriverJobsDeps, OwnerNotice } from "./driver-jobs";
import { notifyOwnerPush, type OwnerPushEnv } from "./owner-push";
import { DEFAULT_BOOKING_EMAIL, trySendEmail, trySendOwnerOperationalEmail, type WorkerEmailEnv } from "./worker-email";
import type { WhatsAppTemplateEnv } from "./whatsapp-templates";

type Env = WorkerEmailEnv & WhatsAppTemplateEnv & OwnerPushEnv & { TRACKING_STORE?: KVNamespace };

function bookingReference(job: BookingJobRecord): string {
  return (job.paymentReference || job.id || "").trim();
}

/** Booking → the dispatch view. The customer fare is deliberately not copied. */
export function toDispatchBooking(job: BookingJobRecord): DispatchBooking {
  const active = job.driverAssignmentStatus === "pending" || job.driverAssignmentStatus === "accepted";
  return {
    reference: bookingReference(job),
    status: job.status,
    outbound: {
      tripDate: job.tripDate || "", tripTime: job.tripTime || "", pickup: job.pickupLabel || "", dropoff: job.dropoffLabel || "",
      flightNumber: job.flightNumber || "",
    },
    return: job.returnJourney && job.returnDate
      ? { tripDate: job.returnDate, tripTime: job.returnTime || "", pickup: job.dropoffLabel || "", dropoff: job.pickupLabel || "", flightNumber: job.returnFlightNumber || "" }
      : null,
    passengers: Number(job.passengers) || 1,
    suitcases: Number(job.suitcases) || 0,
    vehicle: job.vehicle || "",
    customerFirstName: (job.customerName || "").trim().split(/\s+/)[0] ?? "",
    customerMobile: job.customerMobile || "",
    notes: (job.message || "").slice(0, 500),
    assignedOutsidePortal: active && !(job.driverAccountId || "").trim(),
  };
}

async function findBooking(store: KVNamespace, reference: string): Promise<BookingJobRecord | null> {
  const direct = await getBookingJob(store, reference);
  if (direct) return direct;
  return (await listAllBookingJobs(store)).find((j) => bookingReference(j) === reference) ?? null;
}

export function buildDriverJobsDeps(
  env: Env,
  base: Pick<DriverJobsDeps, "ownerAuthorized" | "corsHeaders">,
): DriverJobsDeps {
  const store = env.TRACKING_STORE;
  return {
    ...base,
    getBooking: async (reference) => {
      if (!store) return null;
      const job = await findBooking(store, reference);
      return job ? toDispatchBooking(job) : null;
    },
    listUpcomingBookings: async (today) => {
      if (!store) return [];
      return (await listAllBookingJobs(store))
        .filter((j) => j.kind !== "vehicle-enquiry" && ((j.tripDate || "") >= today || (j.returnJourney && (j.returnDate || "") >= today)))
        .map(toDispatchBooking);
    },
    // The booking keeps one driver. The outbound driver is recorded there; a return-leg driver is
    // recorded only when the booking has no other driver, so one leg never overwrites the other.
    recordAssignment: async (reference, leg, driver: AssignedDriver | null) => {
      if (!store) return;
      const job = await findBooking(store, reference);
      if (!job) return;
      const current = (job.driverAccountId || "").trim();
      const active = job.driverAssignmentStatus === "pending" || job.driverAssignmentStatus === "accepted";
      const now = new Date().toISOString();
      if (driver) {
        if (leg === "return" && active && current && current !== driver.id) return;
        if (active && !current) return; // arranged outside the portal — leave it alone
        await saveBookingJob(store, {
          ...job,
          driverAccountId: driver.id,
          driverFirstName: driver.firstName,
          driverEmail: driver.email,
          driverMobile: driver.mobile,
          driverReg: driver.vehicleReg,
          driverCarModel: driver.vehicle,
          driverCarMake: undefined,
          driverCarColour: undefined,
          driverProfileKey: undefined,
          driverPayAmountPence: driver.feePence,
          driverPayAmount: `£${(driver.feePence / 100).toFixed(2)}`,
          driverAssignmentStatus: "accepted",
          driverAcceptToken: undefined,
          assignedAt: now,
          driverAcceptedAt: now,
          driverDeclinedAt: undefined,
        });
        return;
      }
      // Clearing: only when the booking still names a portal driver.
      if (!current) return;
      await saveBookingJob(store, {
        ...job,
        driverAccountId: undefined, driverFirstName: undefined, driverEmail: undefined, driverMobile: undefined,
        driverReg: undefined, driverCarModel: undefined, driverPayAmountPence: undefined, driverPayAmount: undefined,
        driverAssignmentStatus: "unassigned", driverAcceptedAt: undefined, assignedAt: undefined,
      });
    },
    sendCustomerDriverDetails: async (reference, leg, driver) => {
      if (!store) return { sent: false, reason: "no_store" };
      const job = await findBooking(store, reference);
      if (!job) return { sent: false, reason: "no_booking" };
      const view = toDispatchBooking(job);
      const info = leg === "return" ? view.return : view.outbound;
      const result = await sendCustomerDriverDetailsOnAccept(env, {
        jobKey: `${reference}:${leg}`,
        customerName: job.customerName,
        customerEmail: job.customerEmail,
        customerMobile: job.customerMobile,
        tripDate: info?.tripDate,
        tripTime: info?.tripTime,
        pickupLabel: info?.pickup,
        dropoffLabel: info?.dropoff,
        // First name, mobile and registration only (the email shows the registration in part).
        driverName: driver.firstName,
        driverMobile: driver.mobile,
        carModel: driver.vehicle,
        registration: driver.vehicleReg,
        paymentReference: job.paymentReference,
        journeyLeg: leg,
        airportCode: job.airportCode,
      });
      return result.sent ? { sent: true } : { sent: false, reason: result.reason };
    },
    notifyOwner: async (notice: OwnerNotice) => {
      // Urgent driver alerts always reach the phone, whatever the category switches say.
      await notifyOwnerPush(env, { category: "drivers", title: notice.title, body: notice.body, url: notice.url, tag: notice.tag }, fetch, {
        ignorePrefs: notice.priority === "high",
      });
    },
    emailOwner: async (subject, body) => {
      await trySendOwnerOperationalEmail(env, { to: env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL, subject, body });
    },
    emailDriver: async (driver, subject, body) => {
      await trySendEmail(env, { to: driver.email, toName: driver.name, subject, body, ownerCopy: false, preferWorkerProviders: true });
    },
  };
}
