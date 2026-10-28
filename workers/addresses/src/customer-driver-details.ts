/**
 * Customer "Your driver details" email, sent once when an ASSIGNED driver
 * (anyone other than the owner) accepts a job.
 *
 * Contents: driver first name, driver mobile, vehicle and PARTIAL registration
 * ("CR66 ***"). Never driver pay, surname, driver email or full registration.
 * Email only — nothing here opens or pre-fills WhatsApp.
 *
 * Both accept paths call this: the Accept link in the driver's assignment email
 * (booking job) and the Accept button in the driver's My Jobs page (tracking job).
 * A KV marker per job + driver makes it idempotent across both paths; a
 * reassignment to a different driver sends the new driver's details.
 */

import { buildCustomerDriverDetailsEmail, type BookingJobRecord } from "../shared/booking-job";
import { getOwnerAccountProfile } from "./owner-profile-store";
import { BUSINESS_NAME, trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

export type CustomerDriverDetailsInput = {
  /** Stable id for the journey: payment reference, booking job id or tracking token. */
  jobKey: string;
  customerName?: string | null;
  customerEmail?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  driverName?: string | null;
  driverEmail?: string | null;
  driverMobile?: string | null;
  carMake?: string | null;
  carModel?: string | null;
  carColour?: string | null;
  registration?: string | null;
};

export type CustomerDriverDetailsResult =
  | { sent: true }
  | { sent: false; reason: "owner" | "already_sent" | "no_customer_email" | "no_driver" | "no_store" | "send_failed"; error?: string };

type Env = WorkerEmailEnv & { TRACKING_STORE?: KVNamespace };

const MARKER_TTL_SECONDS = 60 * 60 * 24 * 400;

function normEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normMobile(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // 07… and 447… are the same UK mobile.
  return digits.startsWith("44") ? `0${digits.slice(2)}` : digits;
}

/** True when the assigned driver is the owner (matched on email or mobile). */
export function assignedDriverIsOwner(
  driver: { email?: string | null; mobile?: string | null },
  owner: { email?: string | null; mobile?: string | null } | null | undefined,
): boolean {
  if (!owner) return false;
  const ownerEmail = normEmail(owner.email);
  const ownerMobile = normMobile(owner.mobile);
  const driverEmail = normEmail(driver.email);
  const driverMobile = normMobile(driver.mobile);
  return Boolean(
    (ownerEmail && driverEmail && ownerEmail === driverEmail) ||
      (ownerMobile && driverMobile && ownerMobile === driverMobile),
  );
}

export function customerDriverDetailsMarkerKey(jobKey: string, driver: { email?: string | null; mobile?: string | null; name?: string | null }): string {
  const who = normEmail(driver.email) || normMobile(driver.mobile) || String(driver.name ?? "").trim().toLowerCase() || "driver";
  return `customer-driver-details:${jobKey}:${who}`;
}

export async function sendCustomerDriverDetailsOnAccept(
  env: Env,
  input: CustomerDriverDetailsInput,
): Promise<CustomerDriverDetailsResult> {
  const store = env.TRACKING_STORE;
  if (!store) return { sent: false, reason: "no_store" };
  if (!input.driverName?.trim() && !input.driverMobile?.trim()) return { sent: false, reason: "no_driver" };

  const owner = await getOwnerAccountProfile(store).catch(() => null);
  if (assignedDriverIsOwner({ email: input.driverEmail, mobile: input.driverMobile }, owner)) {
    return { sent: false, reason: "owner" };
  }

  const to = input.customerEmail?.trim();
  if (!to) return { sent: false, reason: "no_customer_email" };

  const markerKey = customerDriverDetailsMarkerKey(input.jobKey, {
    email: input.driverEmail,
    mobile: input.driverMobile,
    name: input.driverName,
  });
  if (await store.get(markerKey)) return { sent: false, reason: "already_sent" };

  const email = buildCustomerDriverDetailsEmail({
    job: {
      customerName: input.customerName ?? "",
      tripDate: input.tripDate ?? "",
      tripTime: input.tripTime ?? "",
      pickupLabel: input.pickupLabel ?? "",
      dropoffLabel: input.dropoffLabel ?? "",
      driverFirstName: input.driverName ?? undefined,
      driverMobile: input.driverMobile ?? undefined,
      driverCarMake: input.carMake ?? undefined,
      driverCarModel: input.carModel ?? undefined,
      driverCarColour: input.carColour ?? undefined,
      driverReg: input.registration ?? undefined,
    } as BookingJobRecord,
    businessName: BUSINESS_NAME,
  });

  const result = await trySendBrandedCustomerEmail(env, {
    to,
    toName: input.customerName ?? undefined,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });
  if (!result.sent) {
    return { sent: false, reason: "send_failed", error: result.error };
  }
  await store.put(markerKey, new Date().toISOString(), { expirationTtl: MARKER_TTL_SECONDS });
  return { sent: true };
}
