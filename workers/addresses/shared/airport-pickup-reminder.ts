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
import { BUSINESS_NAME, BUSINESS_PHONE_DISPLAY, businessWhatsAppChatUrl } from "./business-email";
import { parseDublinArrivalTerminal } from "./dublin-arrival-terminal";
import {
  EXPRESS_FREE_PICKUP_CONFIGURED,
  resolveAirportAccessOption,
} from "./express-drop-off";
import { getServedAirport, matchServedAirportCode } from "./served-airports";
import { formatUkTime, parseLondonLocalDateTime, UK_TIME_ZONE } from "./uk-time";

/** Send once the pickup is within this lead, and only on the London travel day. */
export const AIRPORT_PICKUP_REMINDER_LEAD_MS = 3 * 60 * 60 * 1000;

const REMINDER_AIRPORTS = ["BFS", "BHD", "DUB"] as const;
type ReminderAirportCode = (typeof REMINDER_AIRPORTS)[number];

const SAFE_LIMITED_WAITING_COPY =
  "Airport pickup areas have limited waiting time, so please don't ask your driver to enter the pickup area until you are ready to be collected.";

const VERIFIED_TEN_MINUTE_COPY =
  "The airport pickup area has a maximum stay of 10 minutes, so please contact us once you are at the pickup location and ready to be collected.";

const CONTACT_COPY = `Once you have reached the pickup location and are ready to be collected, please contact us via WhatsApp or call our Business Line on ${BUSINESS_PHONE_DISPLAY}.`;

const MEET_COPY = "Your driver will then meet you at the pickup location.";

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
    };

export function airportPickupReminderGreeting(fullName: string | null | undefined): string {
  if (typeof fullName !== "string") return "Hi,";
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (!first || /^undefined$/i.test(first) || /^null$/i.test(first)) return "Hi,";
  return `Hi ${first},`;
}

export function londonCalendarDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
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
  if (airport === "DUB") return null;
  if (!EXPRESS_FREE_PICKUP_CONFIGURED[airport]) return null;

  const leg = reminderLeg(input);
  const legOption =
    leg === "return" ? input.returnAirportAccessOption : input.outboundAirportAccessOption;
  if (legOption === "express" || legOption === "free") return legOption;

  const legSelected =
    leg === "return" ? input.returnExpressDropOffSelected : input.outboundExpressDropOffSelected;
  if (typeof legSelected === "boolean") return legSelected ? "express" : "free";

  if (leg === "return") return null;

  if (input.airportAccessOption === "express" || input.airportAccessOption === "free") {
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

  if (airport === "DUB") {
    const instruction = buildAirportPickupInstruction({
      isAirportPickup: true,
      airportCode: "DUB",
      pickupLabel: input.pickupLabel ?? getServedAirport("DUB")?.name,
      dublinArrivalTerminal: dublinTerminalForLeg(input),
    });
    return adaptDirections(instruction);
  }

  const access = resolveReminderAirportAccess(input, airport);
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

function flightLine(flightNumber: string | null | undefined): string | null {
  const flight = String(flightNumber ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2,8}$/.test(flight)) return null;
  return `Flight: ${flight}`;
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
  const pickupTime = formatUkTime(String(input.tripTime ?? "").trim());
  const lines = [
    airportPickupReminderGreeting(input.customerName),
    "",
    `Just a reminder about your airport transfer with ${BUSINESS_NAME} today.`,
    "",
    `Your pickup today is from ${airportName}.`,
    ...(pickupTime ? [`Your collection is booked for ${pickupTime}.`] : []),
    ...(flightLine(input.flightNumber) ? [flightLine(input.flightNumber)!] : []),
    "",
    directions,
    "",
    CONTACT_COPY,
    "",
    MEET_COPY,
  ];

  if (directionsStateVerifiedTenMinuteStay(directions)) {
    lines.push("", VERIFIED_TEN_MINUTE_COPY);
  } else {
    lines.push("", SAFE_LIMITED_WAITING_COPY);
  }

  lines.push("", "We look forward to welcoming you.", "", BUSINESS_NAME);
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
  if (tripDate !== londonCalendarDate(now)) return skip("not_today");

  const pickupAt = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickupAt) return skip("missing_pickup_time");
  if (now.getTime() >= pickupAt.getTime()) return skip("pickup_passed");
  if (now.getTime() < pickupAt.getTime() - AIRPORT_PICKUP_REMINDER_LEAD_MS) return skip("too_early");
  if (!input.customerEmail?.trim()) return skip("missing_email");

  const message = buildAirportPickupReminderMessage(input);
  if (!message) return skip("unresolved_pickup");

  const airportName = getServedAirport(reminderAirport(input) ?? "")?.name ?? "the airport";
  const subject = `Airport pickup reminder — ${airportName}`;
  return {
    eligible: true,
    reason: "due",
    message,
    subject,
    text: message,
    html: buildAirportPickupReminderHtml(message),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAirportPickupReminderHtml(message: string): string {
  const whatsAppHref = businessWhatsAppChatUrl(
    "Hi, I have reached the airport pickup location and I am ready to be collected.",
  );
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      let safe = escapeHtml(paragraph).replace(/\n/g, "<br />");
      if (paragraph.includes("WhatsApp")) {
        safe = safe.replace(
          "WhatsApp",
          `<a href="${escapeHtml(whatsAppHref)}" style="color:#071c38;font-weight:bold;">WhatsApp</a>`,
        );
      }
      if (paragraph.includes(BUSINESS_PHONE_DISPLAY)) {
        safe = safe.replace(
          BUSINESS_PHONE_DISPLAY,
          `<a href="tel:+442896022952" style="color:#071c38;font-weight:bold;">${BUSINESS_PHONE_DISPLAY}</a>`,
        );
      }
      return `<p style="margin:0 0 16px;">${safe}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Airport pickup reminder</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#071c38;padding:28px 32px;text-align:center;">
<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#2fbf4a;font-weight:bold;">${escapeHtml(BUSINESS_NAME)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Airport pickup reminder</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">${paragraphs}</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function airportPickupReminderUsesCompanyVoice(message: string): boolean {
  if (FORBIDDEN_PERSONAL_VOICE_PATTERNS.some((pattern) => pattern.test(message))) return false;
  if (/\bI['’]m\b|\bcall me\b|\bmy car\b|\bI['’]m waiting\b|\bI\b/i.test(message)) return false;
  return /\byour driver\b/i.test(message) && /\bwe\b/i.test(message) && message.includes(BUSINESS_NAME);
}

export function airportPickupReminderStatesUnverifiedTenMinutes(
  message: string,
  directions: string,
): boolean {
  const claimsTen = /10 minutes/i.test(message);
  if (!claimsTen) return false;
  return !directionsStateVerifiedTenMinuteStay(directions);
}

