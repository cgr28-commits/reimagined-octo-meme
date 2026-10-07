/**
 * Journey-day reminder for customers being collected FROM an airport.
 *
 * Directions come from the existing company-voice airport pickup copy.
 * Belfast Express and Free are never mixed. Dublin uses the paid pickup
 * copy for the known terminal and has no free Long Stay option.
 *
 * Delivery is the existing Resend email cron. This module does not send
 * anything and does not open WhatsApp or SMS.
 */

import {
  buildAirportPickupInstruction,
  FORBIDDEN_PERSONAL_VOICE_PATTERNS,
  type CompanyVoiceAirportAccessOption,
} from "./company-voice-journey";
import {
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_TEL,
  businessWhatsAppChatUrl,
} from "./business-email";
import { normalizeCustomerBookingReference } from "./customer-booking-reference";
import { parseDublinArrivalTerminal } from "./dublin-arrival-terminal";
import {
  EXPRESS_FREE_PICKUP_CONFIGURED,
  resolveAirportAccessOption,
} from "./express-drop-off";
import { getServedAirport, matchServedAirportCode } from "./served-airports";
import { parseLondonLocalDateTime, UK_TIME_ZONE } from "./uk-time";

/** About four hours before the booked airport pickup. Not the flight arrival time. */
export const AIRPORT_COLLECTION_LEAD_MS = 4 * 60 * 60 * 1000;

/** Kept so older checks can see the collection lead. */
export const AIRPORT_PICKUP_REMINDER_LEAD_MS = AIRPORT_COLLECTION_LEAD_MS;

export const AIRPORT_COLLECTION_EMAIL_SUBJECT =
  "Important information about your airport collection";

/** Do not send between 22:00 and 07:00 London. */
const QUIET_HOUR_START = 22;
const QUIET_HOUR_END = 7;

const REMINDER_AIRPORTS = ["BFS", "BHD", "DUB"] as const;
type ReminderAirportCode = (typeof REMINDER_AIRPORTS)[number];

const CONTACT_INTRO =
  "Once you have reached your pickup location and are ready to be collected, please contact us:";

const READY_COPY =
  "Airport pickup areas have limited waiting time, so please contact us once you have reached the pickup location and are ready to be collected.";

const BUSINESS_LINE_LABEL = "Or call our Business Line:";

const INTRO_COPY =
  "Your airport collection with My Airport Taxi NI is coming up today.";

const READ_COPY =
  "Please read the information below carefully, as it explains where you need to go after arriving at the airport and how to let us know when you're ready to be collected.";

const MEET_COPY = "Your driver will then meet you at the designated pickup location.";

export type AirportPickupReminderLeg = "outbound" | "return";

export type AirportPickupReminderInput = {
  customerName?: string | null;
  customerEmail?: string | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  journeyLeg?: AirportPickupReminderLeg | null;
  isFromAirport?: boolean | null;
  airportCode?: string | null;
  flightNumber?: string | null;
  airportAccessOption?: CompanyVoiceAirportAccessOption | null;
  outboundAirportAccessOption?: CompanyVoiceAirportAccessOption | null;
  returnAirportAccessOption?: CompanyVoiceAirportAccessOption | null;
  expressDropOffSelected?: boolean | null;
  outboundExpressDropOffSelected?: boolean | null;
  returnExpressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  dublinArrivalTerminal?: string | null;
  returnDublinArrivalTerminal?: string | null;
  reminderSentAt?: string | null;
  refundedAt?: string | null;
  operationalStatus?: "confirmed" | "cancelled" | string | null;
  bookingStatus?: string | null;
  cancelledLegs?: Array<AirportPickupReminderLeg> | null;
  outboundCancelledAt?: string | null;
  returnCancelledAt?: string | null;
  journeyStatus?: string | null;
  isRefundTest?: boolean | null;
  /** Ignored. Tests pass a driver mobile to prove it is never copied into the message. */
  assignedDriverMobile?: string | null;
  /** Short customer reference (MAT-####). Payment and checkout ids are not used. */
  customerReference?: string | null;
};

export type AirportPickupReminderSkipReason =
  | "already_sent"
  | "cancelled"
  | "not_customer_booking"
  | "journey_finished"
  | "not_from_airport"
  | "not_today"
  | "pickup_passed"
  | "too_early"
  | "missing_email"
  | "unresolved_pickup"
  | "missing_pickup_time";

export type AirportPickupReminderDecision =
  | { eligible: false; reason: AirportPickupReminderSkipReason; message: null }
  | {
      eligible: true;
      reason: "due";
      message: string;
      subject: string;
      text: string;
      html: string;
      /** wa.me link. Opens WhatsApp with the text filled in. It does not send. */
      whatsAppHref: string;
      whatsAppDraft: string;
    };

function reminderFirstName(fullName: string | null | undefined): string {
  if (typeof fullName !== "string") return "";
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (!first || /^undefined$/i.test(first) || /^null$/i.test(first)) return "";
  return first;
}

export function airportPickupReminderGreeting(fullName: string | null | undefined): string {
  const first = reminderFirstName(fullName);
  return first ? `Hi ${first},` : "Hi,";
}

/**
 * Words the customer can send after they reach the pickup point.
 * wa.me only prefills this. Nothing is sent until the customer presses Send.
 */
export function airportPickupWhatsAppDraft(input: AirportPickupReminderInput): string | null {
  void input.assignedDriverMobile;
  const airport = reminderAirport(input);
  if (!airport) return null;
  const airportName = getServedAirport(airport)?.name ?? airport;
  const first = reminderFirstName(input.customerName);
  const reference = normalizeCustomerBookingReference(input.customerReference);
  const who = first ? `Hi, this is ${first}.` : "Hi.";
  const booking = reference ? `booking ${reference}` : `my ${BUSINESS_NAME} booking`;
  const terminal = airport === "DUB" ? dublinTerminalForLeg(input) : null;
  const place =
    terminal === "T1"
      ? `${airportName}, Terminal 1`
      : terminal === "T2"
        ? `${airportName}, Terminal 2`
        : airportName;
  return `${who} I have arrived at ${place} and I'm now at the pickup location for ${booking}.`;
}

export function airportPickupWhatsAppHref(input: AirportPickupReminderInput): string | null {
  const draft = airportPickupWhatsAppDraft(input);
  if (!draft) return null;
  // encodeURIComponent leaves apostrophes raw. Encode them so the prefilled text survives email clients.
  return businessWhatsAppChatUrl(draft).replace(/'/g, "%27");
}

export function londonCalendarDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function londonMinutes(instant: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function formatCollectionClock(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour24 = Number(match[1]);
  if (hour24 > 23) return "";
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

function isQuietLondonHour(hour: number): boolean {
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

/**
 * When the collection email should become due.
 * Four hours before the booked pickup, moved out of 22:00–07:00 London.
 */
export function airportCollectionSendAt(pickupAt: Date): Date | null {
  if (Number.isNaN(pickupAt.getTime())) return null;
  const target = new Date(pickupAt.getTime() - AIRPORT_COLLECTION_LEAD_MS);
  const targetMinutes = londonMinutes(target);
  const pickupMinutes = londonMinutes(pickupAt);
  if (targetMinutes == null || pickupMinutes == null || !isQuietLondonHour(Math.floor(targetMinutes / 60))) {
    return target;
  }

  const pickupDate = londonCalendarDate(pickupAt);
  if (pickupMinutes > QUIET_HOUR_END * 60) {
    const morning = parseLondonLocalDateTime(pickupDate, "07:00");
    if (morning && morning.getTime() < pickupAt.getTime()) return morning;
  }

  const midday = parseLondonLocalDateTime(pickupDate, "12:00");
  if (!midday) return target;
  return new Date(midday.getTime() - 16 * 60 * 60 * 1000);
}

function reminderLeg(input: AirportPickupReminderInput): AirportPickupReminderLeg {
  return input.journeyLeg === "return" ? "return" : "outbound";
}

/** Collection airport from the pickup label only — never the drop-off airport. */
function reminderAirport(input: AirportPickupReminderInput): ReminderAirportCode | null {
  const fromPickup = matchServedAirportCode(input.pickupLabel ?? "");
  if (fromPickup === "BFS" || fromPickup === "BHD" || fromPickup === "DUB") return fromPickup;
  return null;
}

/**
 * Belfast collection option for this leg only.
 * Returns null when the purchased option is not stored — never defaults to Express.
 * Dublin is not an Express/Free choice.
 */
export function resolveReminderAirportAccess(
  input: AirportPickupReminderInput,
  airport: ReminderAirportCode,
): CompanyVoiceAirportAccessOption | null {
  const leg = reminderLeg(input);
  const legOption =
    leg === "return" ? input.returnAirportAccessOption : input.outboundAirportAccessOption;
  if (legOption === "meet-greet") return "meet-greet";
  if (airport === "DUB") return null;
  if (!EXPRESS_FREE_PICKUP_CONFIGURED[airport]) return null;

  if (legOption === "express" || legOption === "free") return legOption;

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

  return resolveAirportAccessOption({
    expressDropOffSelected: input.expressDropOffSelected,
    expressDropOffFee: input.expressDropOffFee,
    expressDropOffAirport: input.expressDropOffAirport ?? airport,
  });
}

function dublinTerminalForLeg(input: AirportPickupReminderInput) {
  const raw =
    reminderLeg(input) === "return"
      ? input.returnDublinArrivalTerminal
      : input.dublinArrivalTerminal;
  return parseDublinArrivalTerminal(raw);
}

/**
 * Location instructions from the existing airport pickup copy.
 * Null when Belfast Express/Free is not stored, so a reminder cannot guess.
 */
export function buildAirportPickupReminderDirections(
  input: AirportPickupReminderInput,
): string | null {
  const airport = reminderAirport(input);
  if (!airport) return null;

  const access = resolveReminderAirportAccess(input, airport);
  if (access === "meet-greet") {
    return adaptDirections(
      buildAirportPickupInstruction({
        isAirportPickup: true,
        airportCode: airport,
        pickupLabel: input.pickupLabel ?? getServedAirport(airport)?.name,
        airportAccessOption: "meet-greet",
      }),
    );
  }

  if (airport === "DUB") {
    const instruction = buildAirportPickupInstruction({
      isAirportPickup: true,
      airportCode: "DUB",
      pickupLabel: input.pickupLabel ?? getServedAirport("DUB")?.name,
      dublinArrivalTerminal: dublinTerminalForLeg(input),
    });
    return adaptDirections(instruction);
  }

  if (access !== "express" && access !== "free") return null;

  const instruction = buildAirportPickupInstruction({
    isAirportPickup: true,
    airportCode: airport,
    pickupLabel: input.pickupLabel ?? getServedAirport(airport)?.name,
    airportAccessOption: access,
  });
  return adaptDirections(instruction);
}

function adaptDirections(instruction: string | null): string | null {
  const text = instruction?.trim() ?? "";
  if (!text) return null;
  if (/^Please make your way to\b/i.test(text)) {
    return text.replace(/^Please make your way to\b/i, "Please follow the airport signs to");
  }
  return text;
}

function directionsStateVerifiedTenMinuteStay(directions: string): boolean {
  return /maximum stay of 10 minutes/i.test(directions);
}

function collectionOptionLabel(
  airport: ReminderAirportCode,
  input: AirportPickupReminderInput,
): string | null {
  const access = resolveReminderAirportAccess(input, airport);
  if (access === "meet-greet") return "Meet & Greet";
  if (airport === "DUB") return "Paid pickup";
  if (access === "express") return "Express Pickup Included";
  if (access === "free") return "Free Pickup";
  return null;
}

/** Canonical customer text. Null when this booking must not receive collection directions. */
export function buildAirportPickupReminderMessage(
  input: AirportPickupReminderInput,
): string | null {
  void input.assignedDriverMobile;
  const airport = reminderAirport(input);
  const directions = buildAirportPickupReminderDirections(input);
  if (!airport || !directions) return null;

  const airportName = getServedAirport(airport)?.name ?? airport;
  const pickupTime = formatCollectionClock(String(input.tripTime ?? "").trim());
  const option = collectionOptionLabel(airport, input);
  const whatsAppHref = airportPickupWhatsAppHref(input);
  const lines = [
    airportPickupReminderGreeting(input.customerName),
    "",
    INTRO_COPY,
    "",
    READ_COPY,
    "",
    "YOUR COLLECTION",
    `Airport: ${airportName}`,
    ...(pickupTime ? [`Pickup time: ${pickupTime}`] : []),
    ...(option ? [`Collection option: ${option}`] : []),
    "",
    "WHERE TO GO",
    directions,
    "",
    "WHEN YOU ARE READY",
    READY_COPY,
  ];

  if (whatsAppHref) {
    lines.push(
      "",
      CONTACT_INTRO,
      "",
      "MESSAGE US ON WHATSAPP",
      whatsAppHref,
      "",
      BUSINESS_LINE_LABEL,
      BUSINESS_PHONE_DISPLAY,
    );
  }

  lines.push("", MEET_COPY, "", "We look forward to welcoming you.", "", BUSINESS_NAME);
  return lines.join("\n");
}

function isCancelledBooking(input: AirportPickupReminderInput): boolean {
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

function isAirportCollection(input: AirportPickupReminderInput): boolean {
  if (input.isFromAirport === false) return false;
  return reminderAirport(input) != null;
}

export function evaluateAirportPickupReminder(
  input: AirportPickupReminderInput,
  now: Date = new Date(),
): AirportPickupReminderDecision {
  const skip = (reason: AirportPickupReminderSkipReason): AirportPickupReminderDecision => ({
    eligible: false,
    reason,
    message: null,
  });

  if (input.reminderSentAt?.trim()) return skip("already_sent");
  if (input.isRefundTest) return skip("not_customer_booking");
  if (isCancelledBooking(input)) return skip("cancelled");
  if (input.journeyStatus === "completed") return skip("journey_finished");
  if (!isAirportCollection(input)) return skip("not_from_airport");

  const tripDate = String(input.tripDate ?? "").trim();
  const tripTime = String(input.tripTime ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !tripTime) return skip("missing_pickup_time");

  const pickupAt = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickupAt) return skip("missing_pickup_time");
  const sendAt = airportCollectionSendAt(pickupAt);
  if (!sendAt) return skip("missing_pickup_time");
  if (now.getTime() >= pickupAt.getTime()) return skip("pickup_passed");
  if (now.getTime() < sendAt.getTime()) return skip("too_early");
  if (!input.customerEmail?.trim()) return skip("missing_email");

  const message = buildAirportPickupReminderMessage(input);
  const whatsAppDraft = airportPickupWhatsAppDraft(input);
  const whatsAppHref = airportPickupWhatsAppHref(input);
  if (!message || !whatsAppDraft || !whatsAppHref) return skip("unresolved_pickup");

  const subject = AIRPORT_COLLECTION_EMAIL_SUBJECT;
  return {
    eligible: true,
    reason: "due",
    message,
    subject,
    text: message,
    html: buildAirportPickupReminderHtml(message, whatsAppHref),
    whatsAppHref,
    whatsAppDraft,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function whatsAppButtonBlock(href: string): string {
  const safeHref = escapeHtml(href);
  return `<div style="margin:8px 0 20px;text-align:center;">
<a href="${safeHref}" style="display:inline-block;background:#2fbf4a;color:#071c38;text-decoration:none;font-size:18px;font-weight:bold;line-height:1.2;padding:16px 28px;border-radius:8px;">MESSAGE US ON WHATSAPP</a>
<p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#64748b;text-align:left;">If the button does not open, use this link:<br /><a href="${safeHref}" style="color:#071c38;word-break:break-all;">${safeHref}</a></p>
</div>`;
}

function buildAirportPickupReminderHtml(message: string, whatsAppHref: string): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      if (paragraph.startsWith("MESSAGE US ON WHATSAPP")) {
        return whatsAppButtonBlock(whatsAppHref);
      }
      if (paragraph === "YOUR COLLECTION" || paragraph === "WHERE TO GO" || paragraph === "WHEN YOU ARE READY") {
        return `<p style="margin:18px 0 8px;font-size:13px;letter-spacing:0.08em;font-weight:bold;color:#071c38;">${escapeHtml(paragraph)}</p>`;
      }
      let safe = escapeHtml(paragraph).replace(/\n/g, "<br />");
      if (paragraph.includes(BUSINESS_PHONE_DISPLAY)) {
        safe = safe.replace(
          BUSINESS_PHONE_DISPLAY,
          `<a href="tel:${BUSINESS_PHONE_TEL}" style="color:#071c38;font-weight:bold;">${BUSINESS_PHONE_DISPLAY}</a>`,
        );
      }
      return `<p style="margin:0 0 16px;">${safe}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Important information about your airport collection</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#071c38;padding:28px 32px;text-align:center;">
<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#2fbf4a;font-weight:bold;">${escapeHtml(BUSINESS_NAME)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Important information about your airport collection</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">${paragraphs}</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function airportPickupReminderUsesCompanyVoice(message: string): boolean {
  const prose = message.replace(/https:\/\/wa\.me\/\S+/g, " ");
  if (FORBIDDEN_PERSONAL_VOICE_PATTERNS.some((pattern) => pattern.test(prose))) return false;
  if (/\bI['’]m\b|\bcall me\b|\bmy car\b|\bI['’]m waiting\b|\bI\b/i.test(prose)) return false;
  return /\byour driver\b/i.test(prose) && /\bwe\b/i.test(prose) && prose.includes(BUSINESS_NAME);
}

export function airportPickupReminderStatesUnverifiedTenMinutes(
  message: string,
  directions: string,
): boolean {
  const claimsTen = /10 minutes/i.test(message);
  if (!claimsTen) return false;
  return !directionsStateVerifiedTenMinuteStay(directions);
}

