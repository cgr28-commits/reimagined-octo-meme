import { belfastInternationalMapHtml, belfastInternationalMapText } from "./belfast-international-airport-map";
import { airportPickupReminderGreeting, isCancelledBooking, type AirportPickupReminderInput } from "./airport-pickup-reminder";
import { belfastCityMapHtml, belfastCityMapText } from "./belfast-city-airport-map";
import { BUSINESS_NAME, businessWhatsAppChatUrl, businessEmailClientMeta, businessEmailLogoHtml, lightCustomerEmailHtml } from "./business-email";
import { normalizeCustomerBookingReference } from "./customer-booking-reference";
import { customerFacingVehicleName } from "./vehicle-display";
import { formatUkDate, formatUkTime, parseLondonLocalDateTime } from "./uk-time";

export const JOURNEY_REMINDER_LEAD_MS = 4 * 60 * 60 * 1000;
export type JourneyReminderInput = AirportPickupReminderInput & {
  passengers?: number;
  suitcases?: number;
  suitcasesExact?: boolean;
  vehicle?: string;
};

/** Use actual stored names only; an email address or placeholder is not a first name. */
export function resolveJourneyReminderCustomerName(...names: unknown[]): string {
  for (const value of names) {
    if (typeof value !== "string") continue;
    const name = value.trim().replace(/\s+/g, " ");
    if (name && !name.includes("@") && !/^(undefined|null|unknown|customer|guest|there)$/i.test(name)) return name;
  }
  return "";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function evaluateJourneyReminder(input: JourneyReminderInput, now = new Date()) {
  const skip = (reason: string) => ({ eligible: false as const, reason });
  if (input.reminderSentAt?.trim()) return skip("already_sent");
  if (input.isRefundTest) return skip("not_customer_booking");
  if (isCancelledBooking(input)) return skip("cancelled");
  if (!["confirmed", "partially_refunded", "refunded_active"].includes(input.bookingStatus ?? "")) return skip("not_confirmed");
  if (["completed", "en_route", "arrived_destination"].includes(input.journeyStatus ?? "")) return skip("journey_finished");
  if (!input.customerEmail?.trim()) return skip("missing_email");
  if (!input.pickupLabel?.trim() || !input.dropoffLabel?.trim()) return skip("missing_addresses");
  const pickupAt = parseLondonLocalDateTime(input.tripDate ?? "", input.tripTime ?? "");
  if (!pickupAt) return skip("missing_pickup_time");
  if (!Number.isFinite(now.getTime())) return skip("invalid_now");
  if (now.getTime() >= pickupAt.getTime()) return skip("pickup_passed");
  if (now.getTime() < pickupAt.getTime() - JOURNEY_REMINDER_LEAD_MS) return skip("too_early");

  const ref = normalizeCustomerBookingReference(input.customerReference);
  const customerName = resolveJourneyReminderCustomerName(input.customerName);
  const greeting = airportPickupReminderGreeting(customerName);
  const messageHref = businessWhatsAppChatUrl(ref
    ? `Hi, I need help with my booking ${ref}.`
    : "Hi, I need help with my upcoming journey.").replace(/'/g, "%27");
  const leg = input.journeyLeg === "return" ? "Return journey" : "Journey";
  const rows = [
    ...(ref ? [["Booking reference", ref]] : []),
    ["Pickup", input.pickupLabel], ["Drop-off", input.dropoffLabel],
    ["Date", formatUkDate(input.tripDate ?? "")],
    ["Pickup time", `${formatUkTime(input.tripTime ?? "")} (UK local time)`],
    ...(input.passengers != null ? [["Passengers", String(input.passengers)]] : []),
    ...(input.suitcases != null ? [["Suitcases", `${input.suitcases}${input.suitcasesExact === false ? "+" : ""}`]] : []),
    ...(input.vehicle ? [["Vehicle", customerFacingVehicleName(input.vehicle)]] : []),
  ];
  const intro = `This is a reminder of your upcoming ${input.journeyLeg === "return" ? "return " : ""}journey with ${BUSINESS_NAME}. Please be ready at your booked pickup time.`;
  const text = `${greeting}\n\n${intro}\n\n${leg.toUpperCase()}\n${rows.map(([key, value]) => `${key}: ${value}`).join("\n")}${belfastCityMapText(input)}${belfastInternationalMapText(input)}\n\nIf you need help, message us on WhatsApp:\n${messageHref}\nOr reply to this email.\n\n${BUSINESS_NAME}`;
  const html = lightCustomerEmailHtml(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />${businessEmailClientMeta()}<title>Your journey reminder</title></head>
<body style="margin:0;background:#ffffff;color:#071c38;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;"><tr><td style="padding:24px 16px;text-align:center;">${businessEmailLogoHtml()}<h1 style="font-size:24px;line-height:1.35;">Your ${input.journeyLeg === "return" ? "return " : ""}journey reminder</h1></td></tr>
<tr><td style="padding:16px;font-size:16px;line-height:1.7;word-break:break-word;"><p><strong>${escapeHtml(greeting)}</strong></p><p>${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">${rows.map(([key, value]) => `<tr><td style="width:35%;padding:10px 8px 10px 0;vertical-align:top;border-bottom:1px solid #e2e8f0;">${escapeHtml(key)}</td><td style="padding:10px 0;vertical-align:top;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(value)}</td></tr>`).join("")}</table>
${belfastCityMapHtml(input)}${belfastInternationalMapHtml(input)}<p>If you need help, message us on WhatsApp.</p>
<div style="margin:20px 0;text-align:center;"><a href="${escapeHtml(messageHref)}" style="display:inline-block;background:#2fbf4a;color:#071c38;text-decoration:none;font-size:18px;font-weight:bold;line-height:1.3;padding:16px 28px;border-radius:8px;">Message Us</a></div>
<p style="font-size:14px;">If the button does not open, reply to this email.</p><p>${BUSINESS_NAME}</p></td></tr></table></td></tr></table></body></html>`);
  return { eligible: true as const, reason: "due", subject: `${leg} reminder${ref ? ` — ${ref}` : ""}`, text, html };
}
