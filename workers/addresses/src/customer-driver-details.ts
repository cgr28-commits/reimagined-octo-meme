/**
 * Customer "Your driver details" email, sent once when an assigned driver
 * accepts a job, or when the owner assigns the job to himself. When the owner
 * is the driver, missing details are filled from the owner profile.
 * Meet & Greet customers also get the "driver waits in arrivals with a name
 * board" line.
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
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import { legPickupAirportAccessOption } from "../shared/meet-greet";
import { matchServedAirportCode } from "../shared/served-airports";
import { sendDriverDetailsWhatsApp, type WhatsAppTemplateEnv } from "./whatsapp-templates";
import { BUSINESS_NAME, trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

export type CustomerDriverDetailsInput = {
  /** Stable id for the journey: payment reference, booking job id or tracking token. */
  jobKey: string;
  customerName?: string | null;
  customerEmail?: string | null;
  /** Customer mobile, for the WhatsApp copy of these details (approved template only). */
  customerMobile?: string | null;
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
  /** Customer bought Meet & Greet for this pick-up. Looked up from the paid booking when omitted. */
  meetGreet?: boolean;
  paymentReference?: string | null;
  /** "any" when the leg is unknown (booking-job accept link). */
  journeyLeg?: "outbound" | "return" | "any" | null;
  airportCode?: string | null;
  /** Owner assigned the job to himself (roster self-assign, no driver email). */
  ownerIsDriver?: boolean;
};

export type CustomerDriverDetailsResult =
  | { sent: true }
  | { sent: false; reason: "owner" | "already_sent" | "no_customer_email" | "no_driver" | "no_store" | "send_failed"; error?: string };

type Env = WorkerEmailEnv & WhatsAppTemplateEnv & { TRACKING_STORE?: KVNamespace };

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

/** True when this leg's airport pick-up was booked with Meet & Greet. */
async function customerBoughtMeetGreet(
  store: KVNamespace,
  input: CustomerDriverDetailsInput,
): Promise<boolean> {
  // Only airport pick-ups (the pick-up itself must be an airport).
  const airportCode = matchServedAirportCode(input.pickupLabel ?? "");
  if (!airportCode) return false;
  const reference = input.paymentReference?.trim();
  if (!reference || !paidBookingStoreConfigured(store)) return false;
  const paid = await getPaidBookingRecord(store, reference).catch(() => null);
  return legPickupAirportAccessOption(paid, input.journeyLeg, airportCode) === "meet-greet";
}

export async function sendCustomerDriverDetailsOnAccept(
  env: Env,
  input: CustomerDriverDetailsInput,
): Promise<CustomerDriverDetailsResult> {
  const store = env.TRACKING_STORE;
  if (!store) return { sent: false, reason: "no_store" };

  // Owner driving the job himself: fill any blanks from the owner profile.
  const owner = await getOwnerAccountProfile(store).catch(() => null);
  const ownerDriving =
    input.ownerIsDriver === true ||
    assignedDriverIsOwner({ email: input.driverEmail, mobile: input.driverMobile }, owner);
  if (ownerDriving && owner) {
    input = {
      ...input,
      driverName: input.driverName?.trim() || owner.displayName,
      driverEmail: input.driverEmail?.trim() || owner.email,
      driverMobile: input.driverMobile?.trim() || owner.mobile,
      carMake: input.carMake?.trim() || owner.make,
      carModel: input.carModel?.trim() || owner.model,
      carColour: input.carColour?.trim() || owner.colour,
      registration: input.registration?.trim() || owner.registration,
    };
  }
  if (!input.driverName?.trim() && !input.driverMobile?.trim()) return { sent: false, reason: "no_driver" };

  if (input.meetGreet === undefined) {
    input = { ...input, meetGreet: await customerBoughtMeetGreet(store, input) };
  }

  // WhatsApp copy (independent of email; idempotent per job + driver).
  await sendDriverDetailsWhatsApp(env, {
    jobKey: customerDriverDetailsMarkerKey(input.jobKey, {
      email: input.driverEmail,
      mobile: input.driverMobile,
      name: input.driverName,
    }).replace(/^customer-driver-details:/, ""),
    customerName: input.customerName,
    mobile: input.customerMobile,
    tripDate: input.tripDate,
    tripTime: input.tripTime,
    driverName: input.driverName,
    driverMobile: input.driverMobile,
    carColour: input.carColour,
    carMake: input.carMake,
    carModel: input.carModel,
    registration: input.registration,
  });

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
    meetGreet: input.meetGreet === true,
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
