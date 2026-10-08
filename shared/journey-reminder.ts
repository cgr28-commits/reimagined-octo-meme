/**
 * Three-hour journey reminder.
 *
 * The previous airport email was sent about four hours before an airport
 * collection only, shifted out of the overnight quiet period, and always used
 * the company WhatsApp number. Driver mobiles were intentionally omitted.
 *
 * This reminder is due at the booked pickup minus three hours in UK local time
 * (Europe/London, including daylight saving). Each leg is separate. Personal
 * driver details stay on the live contact page and unlock two hours before
 * pickup. The email may include the company WhatsApp and business telephone.
 * It must not include an external driver's mobile, tel: link, or wa.me link.
 * The message does not promise that the provider will deliver at that exact minute.
 */

import {
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_TEL,
  BUSINESS_WHATSAPP_DIGITS,
  businessWhatsAppChatUrl,
} from "./business-email";
import { AIRPORT_PICKUP_COPY } from "./company-voice-journey";
import { parseDublinArrivalTerminal } from "./dublin-arrival-terminal";
import {
  EXPRESS_FREE_PICKUP_CONFIGURED,
  expressQuoteExpressHint,
  expressQuoteFreeHint,
  resolveAirportAccessOption,
  type AirportAccessOption,
} from "./express-drop-off";
import { isExecutiveVehicle } from "./executive-vehicle";
import { MEET_GREET_DESCRIPTION } from "./meet-greet";
import { getServedAirport, matchServedAirportCode } from "./served-airports";
import { formatUkDate, parseLondonLocalDateTime } from "./uk-time";

export const JOURNEY_REMINDER_LEAD_MS = 3 * 60 * 60 * 1000;
/** Personal driver name and mobile unlock on the live page at this lead. */
export const DRIVER_CONTACT_REVEAL_LEAD_MS = 2 * 60 * 60 * 1000;
export const DRIVER_CONTACT_UNLOCK_MESSAGE =
  "Your driver’s contact details will be available 2 hours before your scheduled pickup.";
export const JOURNEY_REMINDER_CLAIM_MS = 30 * 60 * 1000;

export const JOURNEY_REMINDER_SUBJECT = "Your journey reminder — My Airport Taxi NI";
export const JOURNEY_DRIVER_UPDATE_SUBJECT = "Updated driver details — My Airport Taxi NI";

export const JOURNEY_REMINDER_LANDING_HEADING =
  "IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND";

export const JOURNEY_REMINDER_LANDING_BODY =
  "Once your flight has landed, please switch on your mobile phone and contact your driver using the contact buttons provided.\n" +
  "This helps us coordinate your airport collection.\n" +
  "Once you’ve collected your luggage and are ready for collection, please update your driver.\n" +
  "If you’re delayed at passport control or baggage reclaim, please keep your driver informed.";

export const JOURNEY_REMINDER_LANDING_BEFORE_UNLOCK =
  "If you land before your driver’s contact details are available, please contact My Airport Taxi NI using the company WhatsApp and Call Us buttons.";

const REMINDER_AIRPORTS = ["BFS", "BHD", "DUB"] as const;
type ReminderAirportCode = (typeof REMINDER_AIRPORTS)[number];

export const JOURNEY_REMINDER_AIRPORT_COPY_KEYS = [
  "bfsExpressCollection",
  "bfsFreeCollection",
  "bhdExpressCollection",
  "bhdFreeCollection",
  "dubT1Collection",
  "dubT2Collection",
  "dubUnconfirmedCollection",
  "meetGreetCollection",
  "bfsExpressDropOff",
  "bfsFreeDropOff",
  "bhdExpressDropOff",
  "bhdFreeDropOff",
  "dubDropOff",
] as const;

export type JourneyReminderAirportCopyKey = (typeof JOURNEY_REMINDER_AIRPORT_COPY_KEYS)[number];
export type JourneyReminderAirportCopy = Record<JourneyReminderAirportCopyKey, string>;

export type JourneyReminderLeg = "outbound" | "return";
export type JourneyReminderAssignmentStatus = "unassigned" | "pending" | "accepted" | "declined";

export type JourneyReminderInput = {
  customerName?: string | null;
  customerEmail?: string | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  journeyLeg?: JourneyReminderLeg | null;
  isFromAirport?: boolean | null;
  airportCode?: string | null;
  flightNumber?: string | null;
  vehicle?: string | null;
  airportAccessOption?: AirportAccessOption | null;
  outboundAirportAccessOption?: AirportAccessOption | null;
  returnAirportAccessOption?: AirportAccessOption | null;
  expressDropOffSelected?: boolean | null;
  outboundExpressDropOffSelected?: boolean | null;
  returnExpressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  dublinArrivalTerminal?: string | null;
  returnDublinArrivalTerminal?: string | null;
  reminderSentAt?: string | null;
  /** Pickup instant the last reminder was sent for. A different pickup invalidates it. */
  reminderSentForPickupAt?: string | null;
  reminderDriverKey?: string | null;
  driverUpdateSentForKey?: string | null;
  assignmentStatus?: JourneyReminderAssignmentStatus | string | null;
  assignedDriverName?: string | null;
  assignedDriverMobile?: string | null;
  refundedAt?: string | null;
  operationalStatus?: "confirmed" | "cancelled" | string | null;
  bookingStatus?: string | null;
  cancelledLegs?: Array<JourneyReminderLeg> | null;
  outboundCancelledAt?: string | null;
  returnCancelledAt?: string | null;
  journeyStatus?: string | null;
  isRefundTest?: boolean | null;
  airportCopy?: Partial<JourneyReminderAirportCopy> | null;
  /**
   * Secure page for this booking. The email buttons use only this URL.
   * A wa.me or tel: value is ignored.
   */
  driverContactUrl?: string | null;
};

export type JourneyReminderSkipReason =
  | "already_sent"
  | "cancelled"
  | "not_customer_booking"
  | "journey_finished"
  | "pickup_passed"
  | "too_early"
  | "missing_email"
  | "missing_pickup_time";

export type JourneyReminderContact =
  | {
      kind: "driver";
      firstName: string;
      mobileDisplay: string;
      mobileTel: string;
      whatsAppDigits: string;
    }
  | { kind: "company" };

export type JourneyReminderDecision =
  | { eligible: false; reason: JourneyReminderSkipReason; message: null }
  | {
      eligible: true;
      kind: "reminder" | "driver_update";
      reason: "due";
      message: string;
      subject: string;
      text: string;
      html: string;
      /** Secure driver-contact page. Not a wa.me link. */
      contactPageHref: string;
      pickupKey: string;
      driverKey: string;
      contact: JourneyReminderContact;
    };

export function defaultJourneyReminderAirportCopy(): JourneyReminderAirportCopy {
  const bfs = getServedAirport("BFS")?.name ?? "Belfast International Airport";
  const bhd = getServedAirport("BHD")?.name ?? "George Best Belfast City Airport";
  const dub = getServedAirport("DUB")?.name ?? "Dublin Airport";
  const expressPickup = expressQuoteExpressHint("pick-up").replace(" · ", ". ");
  const expressDrop = expressQuoteExpressHint("drop-off").replace(" · ", ". ");
  return {
    bfsExpressCollection: `${bfs} — Express Pick-Up. Please make your way to Express Pick-Up. ${expressPickup}`,
    bfsFreeCollection: `${bfs} — Long Stay Car Park Free Pick-Up Location. ${AIRPORT_PICKUP_COPY.bfsBhdFree} ${expressQuoteFreeHint("pick-up", "BFS").replace(" · ", ". ")}`,
    bhdExpressCollection: `${bhd} — Express Pick-Up. Please make your way to Express Pick-Up. ${expressPickup}`,
    bhdFreeCollection: `${bhd} — Long Stay Car Park Free Pick-Up Location. ${AIRPORT_PICKUP_COPY.bfsBhdFree} ${expressQuoteFreeHint("pick-up", "BHD").replace(" · ", ". ")}`,
    dubT1Collection: `${dub} — Terminal 1. ${AIRPORT_PICKUP_COPY.dubT1}`,
    dubT2Collection: `${dub} — Terminal 2. ${AIRPORT_PICKUP_COPY.dubT2}`,
    dubUnconfirmedCollection: `${dub}. ${AIRPORT_PICKUP_COPY.dubUnknown}`,
    meetGreetCollection:
      `${MEET_GREET_DESCRIPTION} Please wait at the agreed arrivals meeting point after you land. ` +
      "You do not need to walk to Express Pick-Up. The vehicle can use the airport’s designated collection area.",
    bfsExpressDropOff: `${bfs}. Your driver will use the designated Express Drop-Off area. ${expressDrop}`,
    bfsFreeDropOff: `${bfs}. ${expressQuoteFreeHint("drop-off", "BFS")}`,
    bhdExpressDropOff: `${bhd}. Your driver will use the designated Express Drop-Off area. ${expressDrop}`,
    bhdFreeDropOff: `${bhd}. ${expressQuoteFreeHint("drop-off", "BHD")}`,
    dubDropOff: `${dub}. Your driver will use the designated Express Drop-Off area for your terminal. ${expressDrop}`,
  };
}

function sanitizeAirportCopy(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, 800);
}

export function resolveJourneyReminderAirportCopy(
  override?: Partial<JourneyReminderAirportCopy> | null,
): JourneyReminderAirportCopy {
  const resolved = defaultJourneyReminderAirportCopy();
  if (!override) return resolved;
  for (const key of JOURNEY_REMINDER_AIRPORT_COPY_KEYS) {
    const next = sanitizeAirportCopy(override[key]);
    if (next) resolved[key] = next;
  }
  return resolved;
}

/** UK or Irish mobile in international digits. Landlines and junk return null. */
export function normalizeDriverMobileDigits(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("440")) digits = `44${digits.slice(3)}`;
  if (digits.startsWith("3530")) digits = `353${digits.slice(4)}`;
  if (digits.startsWith("08") && digits.length === 10) digits = `353${digits.slice(1)}`;
  else if (digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  if (/^447\d{9}$/.test(digits)) return digits;
  if (/^3538\d{8}$/.test(digits)) return digits;
  return null;
}

export function formatDriverMobileDisplay(digits: string): string {
  if (/^447\d{9}$/.test(digits)) {
    const local = `0${digits.slice(2)}`;
    return `${local.slice(0, 5)} ${local.slice(5)}`;
  }
  if (/^3538\d{8}$/.test(digits)) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function journeyReminderFirstName(fullName: string | null | undefined): string {
  if (typeof fullName !== "string") return "";
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (!first || /^undefined$/i.test(first) || /^null$/i.test(first)) return "";
  return first;
}

export function isOwnerDriverName(name: string | null | undefined): boolean {
  const value = String(name ?? "").trim().toLowerCase();
  if (!value) return true;
  return value === "owner" || value.includes("owner / primary") || value === "primary driver";
}

export function resolveJourneyReminderContact(input: JourneyReminderInput): JourneyReminderContact {
  if (String(input.assignmentStatus ?? "").trim().toLowerCase() !== "accepted") {
    return { kind: "company" };
  }
  const name = String(input.assignedDriverName ?? "").trim();
  if (isOwnerDriverName(name)) return { kind: "company" };
  const firstName = journeyReminderFirstName(name);
  const digits = normalizeDriverMobileDigits(input.assignedDriverMobile);
  if (!firstName || !digits) return { kind: "company" };
  return {
    kind: "driver",
    firstName,
    mobileDisplay: formatDriverMobileDisplay(digits),
    mobileTel: `+${digits}`,
    whatsAppDigits: digits,
  };
}

export function journeyReminderDriverKey(contact: JourneyReminderContact): string {
  if (contact.kind === "company") return "company";
  return `driver:${contact.firstName.toLowerCase()}:${contact.whatsAppDigits}`;
}

export function formatJourneyReminderClock(time: string | null | undefined): string {
  const match = String(time ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour24 = Number(match[1]);
  if (hour24 > 23) return "";
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

export function formatJourneyReminderDate(date: string | null | undefined): string {
  const iso = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatUkDate(iso);
  const parsed = parseLondonLocalDateTime(iso, "12:00");
  if (!parsed) return formatUkDate(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function journeyReminderSendAt(pickupAt: Date): Date | null {
  if (Number.isNaN(pickupAt.getTime())) return null;
  return new Date(pickupAt.getTime() - JOURNEY_REMINDER_LEAD_MS);
}

export function driverContactRevealAt(pickupAt: Date): Date | null {
  if (Number.isNaN(pickupAt.getTime())) return null;
  return new Date(pickupAt.getTime() - DRIVER_CONTACT_REVEAL_LEAD_MS);
}

export function driverContactDetailsUnlocked(pickupAt: Date, now: Date): boolean {
  const revealAt = driverContactRevealAt(pickupAt);
  return Boolean(revealAt) && now.getTime() >= revealAt!.getTime();
}

export function journeyReminderWhatsAppDraft(
  input: JourneyReminderInput,
  contact: JourneyReminderContact,
): string {
  const date = formatJourneyReminderDate(input.tripDate);
  const time = formatJourneyReminderClock(input.tripTime);
  const flight = String(input.flightNumber ?? "").trim();
  const lines = [
    `Date: ${date}`,
    `Pickup time: ${time}`,
    `Pickup: ${String(input.pickupLabel ?? "").trim()}`,
    `Destination: ${String(input.dropoffLabel ?? "").trim()}`,
  ];
  if (flight) lines.push(`Flight: ${flight}`);
  const details = lines.join("\n");
  if (contact.kind === "driver") {
    return (
      `Hi ${contact.firstName}, I’m contacting you about my transfer with ${BUSINESS_NAME}.\n\n` +
      `${details}\n\nCould you please help me with my journey?`
    );
  }
  return (
    `Hi ${BUSINESS_NAME}, I’m contacting you about my transfer.\n\n` +
    `${details}\n\nCould you please help me with my journey?`
  );
}

export function journeyReminderWhatsAppHref(draft: string, contact: JourneyReminderContact): string {
  const encoded = encodeURIComponent(draft).replace(/'/g, "%27");
  if (contact.kind === "driver") {
    return `https://wa.me/${contact.whatsAppDigits}?text=${encoded}`;
  }
  return businessWhatsAppChatUrl(draft).replace(/'/g, "%27");
}

function reminderLeg(input: JourneyReminderInput): JourneyReminderLeg {
  return input.journeyLeg === "return" ? "return" : "outbound";
}

function reminderAirportFromLabel(label: string | null | undefined): ReminderAirportCode | null {
  const code = matchServedAirportCode(label ?? "");
  if (code === "BFS" || code === "BHD" || code === "DUB") return code;
  return null;
}

export function isJourneyReminderAirportCollection(input: JourneyReminderInput): boolean {
  if (input.isFromAirport === false) return false;
  return reminderAirportFromLabel(input.pickupLabel) != null || input.isFromAirport === true;
}

export function isJourneyReminderAirportDropOff(input: JourneyReminderInput): boolean {
  if (isJourneyReminderAirportCollection(input)) return false;
  return reminderAirportFromLabel(input.dropoffLabel) != null;
}

function accessForLeg(input: JourneyReminderInput, airport: ReminderAirportCode | null): AirportAccessOption | null {
  const leg = reminderLeg(input);
  const legOption = leg === "return" ? input.returnAirportAccessOption : input.outboundAirportAccessOption;
  if (legOption === "meet-greet" || legOption === "express" || legOption === "free") return legOption;
  const legSelected =
    leg === "return" ? input.returnExpressDropOffSelected : input.outboundExpressDropOffSelected;
  if (typeof legSelected === "boolean") return legSelected ? "express" : "free";
  if (leg === "return") return null;
  if (
    input.airportAccessOption === "express" ||
    input.airportAccessOption === "free" ||
    input.airportAccessOption === "meet-greet"
  ) {
    return input.airportAccessOption;
  }
  if (!airport || airport === "DUB" || !EXPRESS_FREE_PICKUP_CONFIGURED[airport]) {
    return resolveAirportAccessOption({
      expressDropOffSelected: input.expressDropOffSelected,
      expressDropOffFee: input.expressDropOffFee,
      expressDropOffAirport: input.expressDropOffAirport ?? airport,
    });
  }
  return resolveAirportAccessOption({
    expressDropOffSelected: input.expressDropOffSelected,
    expressDropOffFee: input.expressDropOffFee,
    expressDropOffAirport: input.expressDropOffAirport ?? airport,
  });
}

function usesMeetAndGreet(input: JourneyReminderInput, airport: ReminderAirportCode | null): boolean {
  if (!isJourneyReminderAirportCollection(input)) return false;
  if (isExecutiveVehicle(input.vehicle)) return true;
  return accessForLeg(input, airport) === "meet-greet";
}

export function buildJourneyReminderAirportInstructions(input: JourneyReminderInput): string | null {
  const copy = resolveJourneyReminderAirportCopy(input.airportCopy);
  const collection = isJourneyReminderAirportCollection(input);
  const dropOff = isJourneyReminderAirportDropOff(input);
  if (!collection && !dropOff) return null;

  if (collection) {
    const airport =
      reminderAirportFromLabel(input.pickupLabel) ??
      (input.airportCode === "BFS" || input.airportCode === "BHD" || input.airportCode === "DUB"
        ? input.airportCode
        : null);
    if (usesMeetAndGreet(input, airport)) return copy.meetGreetCollection;
    if (airport === "DUB") {
      const terminal = parseDublinArrivalTerminal(
        reminderLeg(input) === "return" ? input.returnDublinArrivalTerminal : input.dublinArrivalTerminal,
      );
      if (terminal === "T1") return copy.dubT1Collection;
      if (terminal === "T2") return copy.dubT2Collection;
      return copy.dubUnconfirmedCollection;
    }
    const access = accessForLeg(input, airport);
    if (airport === "BHD") {
      if (access === "free") return copy.bhdFreeCollection;
      if (access === "express") return copy.bhdExpressCollection;
      const name = getServedAirport("BHD")?.name ?? "George Best Belfast City Airport";
      return `${name}. Please follow the signs to the pickup point confirmed on your booking.`;
    }
    if (access === "free") return copy.bfsFreeCollection;
    if (access === "express") return copy.bfsExpressCollection;
    return "Please follow the signs to the pickup point confirmed on your booking.";
  }

  const airport = reminderAirportFromLabel(input.dropoffLabel);
  const access = accessForLeg(input, airport);
  if (airport === "BHD") return access === "free" ? copy.bhdFreeDropOff : copy.bhdExpressDropOff;
  if (airport === "DUB") return copy.dubDropOff;
  return access === "free" ? copy.bfsFreeDropOff : copy.bfsExpressDropOff;
}

export function isJourneyReminderCancelled(input: JourneyReminderInput): boolean {
  if (input.operationalStatus === "cancelled") return true;
  const status = String(input.bookingStatus ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "refunded") return true;
  const leg = reminderLeg(input);
  if (input.cancelledLegs?.includes(leg)) return true;
  if (leg === "outbound" && input.outboundCancelledAt?.trim()) return true;
  if (leg === "return" && input.returnCancelledAt?.trim()) return true;
  const moneyStillTravelling =
    status === "confirmed" || status === "partially_refunded" || status === "refunded_active";
  if (!moneyStillTravelling && input.refundedAt?.trim()) return true;
  return false;
}

function landingBody(input: JourneyReminderInput): string {
  const airport =
    reminderAirportFromLabel(input.pickupLabel) ??
    (input.airportCode === "BFS" || input.airportCode === "BHD" || input.airportCode === "DUB"
      ? input.airportCode
      : null);
  if (usesMeetAndGreet(input, airport)) {
    return (
      "Once your flight has landed, please switch on your mobile phone and contact your driver using the contact buttons provided.\n" +
      "This helps us coordinate your airport collection. Your driver will meet you at the agreed arrivals meeting point with our Meet & Greet service. Please stay there rather than walking to Express Pick-Up.\n" +
      "Once you’ve collected your luggage and are ready for collection, please update your driver.\n" +
      "If you’re delayed at passport control or baggage reclaim, please keep your driver informed."
    );
  }
  return JOURNEY_REMINDER_LANDING_BODY;
}

function greeting(input: JourneyReminderInput): string {
  const first = journeyReminderFirstName(input.customerName);
  return first ? `Hi ${first},` : "Hi,";
}

function journeyDetailLines(input: JourneyReminderInput): string[] {
  const flight = String(input.flightNumber ?? "").trim();
  return [
    `Journey date: ${formatJourneyReminderDate(input.tripDate)}`,
    `Pickup time: ${formatJourneyReminderClock(input.tripTime)}`,
    `Pickup: ${String(input.pickupLabel ?? "").trim()}`,
    `Destination: ${String(input.dropoffLabel ?? "").trim()}`,
    ...(flight ? [`Flight: ${flight}`] : []),
  ];
}

const DRIVER_CONTACT_PAGE_FALLBACK = "https://www.myairporttaxini.co.uk/driver-contact/";

/** Email buttons may only open the secure page. Direct wa.me and tel: values are dropped. */
export function journeyReminderContactPageHref(
  raw: string | null | undefined,
  intent: "message" | "call",
): string {
  try {
    const url = new URL(String(raw ?? "").trim());
    const path = url.pathname.replace(/\/+$/, "");
    if (url.protocol !== "https:" || url.hostname === "wa.me" || !path.endsWith("/driver-contact")) {
      return DRIVER_CONTACT_PAGE_FALLBACK;
    }
    url.searchParams.set("intent", intent);
    url.hash = "";
    return url.toString();
  } catch {
    return DRIVER_CONTACT_PAGE_FALLBACK;
  }
}

export function buildJourneyReminderMessage(
  input: JourneyReminderInput,
  contact: JourneyReminderContact,
  kind: "reminder" | "driver_update",
): string {
  const collection = isJourneyReminderAirportCollection(input);
  const instructions = buildJourneyReminderAirportInstructions(input);
  const lines = [
    greeting(input),
    "",
    kind === "driver_update"
      ? contact.kind === "driver"
        ? "Updated Driver Details\n\nYour driver for this journey has changed. Use the buttons below to see the current contact details."
        : "Updated contact details\n\nPlease use the buttons below for this journey. A previous driver’s details are no longer the ones to use."
      : `Your ${BUSINESS_NAME} pickup is coming up. The time below is the booked pickup time. This note is prepared about three hours beforehand; if it reaches you a little later, please use that booked time.`,
    "",
    ...journeyDetailLines(input),
    "",
    DRIVER_CONTACT_UNLOCK_MESSAGE,
    "The Message Your Driver and Call Your Driver buttons open a secure page for this booking. From 2 hours before pickup they show the driver assigned at that moment. You do not need another email.",
  ];
  if (instructions) {
    lines.push("", collection ? "AIRPORT COLLECTION" : "AIRPORT DROP-OFF", instructions);
  }
  if (collection) {
    lines.push("", JOURNEY_REMINDER_LANDING_HEADING, "", landingBody(input), "", JOURNEY_REMINDER_LANDING_BEFORE_UNLOCK);
  }
  const page = journeyReminderContactPageHref(input.driverContactUrl, "message").replace(/[?&]intent=message$/, "");
  const companyContact: JourneyReminderContact = { kind: "company" };
  const companyWhatsApp = journeyReminderWhatsAppHref(journeyReminderWhatsAppDraft(input, companyContact), companyContact);
  lines.push(
    "",
    "Message Your Driver",
    "Call Your Driver",
    "",
    page,
    "",
    `You can contact ${BUSINESS_NAME} now on WhatsApp or ${BUSINESS_PHONE_DISPLAY}.`,
    "",
    "Message Us on WhatsApp",
    "Call Us",
    "",
    companyWhatsApp,
    `tel:${BUSINESS_PHONE_TEL}`,
    "",
    "We look forward to welcoming you.",
    "",
    BUSINESS_NAME,
  );
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function button(href: string, label: string, background: string, color: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<div style="margin:0 0 16px;">
<a href="${safeHref}" style="display:block;background:${background};color:${color};text-decoration:none;font-size:18px;font-weight:bold;line-height:1.3;padding:18px 22px;border-radius:10px;text-align:center;">${safeLabel}</a>
<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:#64748b;">If the button does not open, use this link:<br /><a href="${safeHref}" style="color:#071c38;word-break:break-all;">${safeHref}</a></p>
</div>`;
}

export function buildJourneyReminderHtml(
  message: string,
  input: JourneyReminderInput,
  kind: "reminder" | "driver_update",
): string {
  const messageHref = journeyReminderContactPageHref(input.driverContactUrl, "message");
  const callHref = journeyReminderContactPageHref(input.driverContactUrl, "call");
  const companyContact: JourneyReminderContact = { kind: "company" };
  const companyWhatsApp = journeyReminderWhatsAppHref(
    journeyReminderWhatsAppDraft(input, companyContact),
    companyContact,
  );
  const companyTel = `tel:${BUSINESS_PHONE_TEL}`;
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      if (paragraph.startsWith("https://") && paragraph.includes("/driver-contact")) return "";
      if (paragraph.startsWith("https://wa.me/") || paragraph.startsWith("tel:")) return "";
      if (paragraph.startsWith("Message Your Driver")) {
        return (
          button(messageHref, "Message Your Driver", "#25D366", "#ffffff") +
          button(callHref, "Call Your Driver", "#071c38", "#ffffff")
        );
      }
      if (paragraph.startsWith("Message Us on WhatsApp")) {
        return (
          button(companyWhatsApp, "Message Us on WhatsApp", "#25D366", "#ffffff") +
          button(companyTel, "Call Us", "#071c38", "#ffffff")
        );
      }
      if (
        paragraph === "AIRPORT COLLECTION" ||
        paragraph === "AIRPORT DROP-OFF" ||
        paragraph === "Updated Driver Details" ||
        paragraph === "Updated contact details" ||
        paragraph === JOURNEY_REMINDER_LANDING_HEADING
      ) {
        const landing = paragraph === JOURNEY_REMINDER_LANDING_HEADING;
        return `<p style="margin:20px 0 8px;font-size:${landing ? "16px" : "13px"};letter-spacing:${landing ? "0" : "0.06em"};font-weight:bold;color:${landing ? "#9a3412" : "#071c38"};">${escapeHtml(paragraph)}</p>`;
      }
      let safe = escapeHtml(paragraph).replace(/\n/g, "<br />");
      if (paragraph.includes(BUSINESS_PHONE_DISPLAY)) {
        safe = safe.replace(
          BUSINESS_PHONE_DISPLAY,
          `<a href="tel:${BUSINESS_PHONE_TEL}" style="color:#071c38;font-weight:bold;">${BUSINESS_PHONE_DISPLAY}</a>`,
        );
      }
      const landingBody = paragraph.startsWith("Once your flight has landed");
      const style = landingBody
        ? "margin:0 0 16px;padding:14px 16px;background:#fff7ed;border-left:4px solid #c2410c;border-radius:8px;"
        : "margin:0 0 16px;";
      return `<p style="${style}">${safe}</p>`;
    })
    .join("");

  const title = kind === "driver_update" ? "Updated driver details" : "Your journey reminder";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#071c38;padding:28px 24px;text-align:center;">
<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#2fbf4a;font-weight:bold;">${escapeHtml(BUSINESS_NAME)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${escapeHtml(title)}</div>
</td></tr>
<tr><td style="padding:24px 20px;font-size:16px;line-height:1.6;color:#334155;">${paragraphs}</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function journeyReminderPickupAt(input: JourneyReminderInput): Date | null {
  const tripDate = String(input.tripDate ?? "").trim();
  const tripTime = String(input.tripTime ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !tripTime) return null;
  return parseLondonLocalDateTime(tripDate, tripTime);
}

export function evaluateJourneyReminder(
  input: JourneyReminderInput,
  now: Date = new Date(),
): JourneyReminderDecision {
  const skip = (reason: JourneyReminderSkipReason): JourneyReminderDecision => ({
    eligible: false,
    reason,
    message: null,
  });

  if (input.isRefundTest) return skip("not_customer_booking");
  if (isJourneyReminderCancelled(input)) return skip("cancelled");
  if (input.journeyStatus === "completed") return skip("journey_finished");
  if (!input.customerEmail?.trim()) return skip("missing_email");

  const pickupAt = journeyReminderPickupAt(input);
  if (!pickupAt) return skip("missing_pickup_time");
  const sendAt = journeyReminderSendAt(pickupAt);
  if (!sendAt) return skip("missing_pickup_time");
  if (now.getTime() >= pickupAt.getTime()) return skip("pickup_passed");

  const pickupKey = pickupAt.toISOString();
  const contact = resolveJourneyReminderContact(input);
  const driverKey = journeyReminderDriverKey(contact);
  const sentAt = String(input.reminderSentAt ?? "").trim();
  const sentFor = String(input.reminderSentForPickupAt ?? "").trim();
  const sentForThisPickup = Boolean(sentAt) && (!sentFor || sentFor === pickupKey);

  if (sentForThisPickup) {
    const updateKey = String(input.driverUpdateSentForKey ?? "").trim();
    const previousDriverKey = String(input.reminderDriverKey ?? "").trim();
    if (previousDriverKey && driverKey !== previousDriverKey && driverKey !== updateKey) {
      const message = buildJourneyReminderMessage(input, contact, "driver_update");
      return {
        eligible: true,
        kind: "driver_update",
        reason: "due",
        message,
        subject: contact.kind === "driver" ? JOURNEY_DRIVER_UPDATE_SUBJECT : "Updated contact details — My Airport Taxi NI",
        text: message,
        html: buildJourneyReminderHtml(message, input, "driver_update"),
        contactPageHref: journeyReminderContactPageHref(input.driverContactUrl, "message"),
        pickupKey,
        driverKey,
        contact,
      };
    }
    return skip("already_sent");
  }

  if (now.getTime() < sendAt.getTime()) return skip("too_early");

  const message = buildJourneyReminderMessage(input, contact, "reminder");
  return {
    eligible: true,
    kind: "reminder",
    reason: "due",
    message,
    subject: JOURNEY_REMINDER_SUBJECT,
    text: message,
    html: buildJourneyReminderHtml(message, input, "reminder"),
    contactPageHref: journeyReminderContactPageHref(input.driverContactUrl, "message"),
    pickupKey,
    driverKey,
    contact,
  };
}

/** Last-moment guard. Company WhatsApp and the business telephone are allowed. */
export function journeyReminderEmailExposesDirectContact(
  text: string,
  html: string,
  contact: JourneyReminderContact,
): boolean {
  const bundle = `${text}\n${html}`;
  const waPaths = [...bundle.matchAll(/wa\.me\/(\d+)/gi)].map((match) => match[1]);
  if (waPaths.some((digits) => digits !== BUSINESS_WHATSAPP_DIGITS)) return true;
  const tels = [...bundle.matchAll(/tel:(\+\d+)/gi)].map((match) => match[1]);
  if (tels.some((tel) => tel !== BUSINESS_PHONE_TEL)) return true;
  if (contact.kind !== "driver") return false;
  return (
    bundle.includes(contact.mobileDisplay) ||
    bundle.includes(contact.mobileTel) ||
    bundle.includes(contact.whatsAppDigits)
  );
}

export function beginJourneyReminderClaim(
  state: { sentAt?: string | null; claimId?: string | null; claimedAt?: string | null },
  now: Date,
): { ok: true; claimId: string } | { ok: false; reason: "already_sent" | "claimed" } {
  if (String(state.sentAt ?? "").trim()) return { ok: false, reason: "already_sent" };
  const claimedAt = Date.parse(String(state.claimedAt ?? ""));
  if (state.claimId && Number.isFinite(claimedAt) && now.getTime() - claimedAt < JOURNEY_REMINDER_CLAIM_MS) {
    return { ok: false, reason: "claimed" };
  }
  return { ok: true, claimId: `jr-${now.getTime().toString(36)}-${Math.random().toString(16).slice(2, 10)}` };
}

/** Drop delivery markers so a rescheduled pickup can send a new reminder. */
export function clearJourneyReminderDelivery<T extends Record<string, unknown>>(job: T): T {
  delete job.airportCollectionInfoSentAt;
  delete job.airportPickupReminderSentAt;
  delete job.airportPickupReminderFailedAt;
  delete job.airportPickupReminderLastError;
  delete job.journeyReminderSentForPickupAt;
  delete job.journeyReminderDriverKey;
  delete job.journeyReminderClaimId;
  delete job.journeyReminderClaimedAt;
  delete job.journeyDriverUpdateSentForKey;
  delete job.journeyDriverUpdateSentAt;
  delete job.journeyDriverUpdateClaimId;
  delete job.journeyDriverUpdateClaimedAt;
  return job;
}
