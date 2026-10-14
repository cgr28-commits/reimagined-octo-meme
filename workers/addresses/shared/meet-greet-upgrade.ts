import type { PaidBookingRecord } from "./paid-booking-record";
import { listAirportPickupLegs, meetGreetFeeGbp, type MeetGreetAirportCode } from "./meet-greet";
import type { OwnerPricingSettings } from "./owner-pricing-config";
import { isExecutiveVehicle } from "./executive-vehicle";
import { parseLondonLocalDateTime, formatUkDate, formatUkTime } from "./uk-time";
import { resolvePaymentAirportContextFromAddresses } from "./open-website-payment-fares";
import { businessEmailLogoHtml, lightCustomerEmailHtml } from "./business-email";

export type MeetGreetEmailSettings = {
  enabled: Record<MeetGreetAirportCode, boolean>;
  enabledSince: Partial<Record<MeetGreetAirportCode, string>>;
};
export const defaultMeetGreetEmailSettings = (): MeetGreetEmailSettings => ({ enabled: { BFS: false, BHD: false, DUB: false }, enabledSince: {} });
export type MeetGreetUpgrade = {
  token: string; paymentReference: string; customerReference: string;
  leg: "outbound" | "return"; airport: MeetGreetAirportCode; amount: number;
  pickupDate: string; pickupTime: string; pickupLabel: string; dropoffLabel: string;
  manual?: boolean;
  offeredAt?: string; checkoutId?: string; checkoutReference?: string; paymentUrl?: string;
  paidAt?: string; transactionCode?: string; transactionId?: string;
  closedReason?: string;
  attachedAt?: string; confirmationSentAt?: string; confirmationError?: string;
};
export const MEET_GREET_EMAIL_DELAY_MS = 30 * 60 * 1000;
export const MEET_GREET_AIRPORT_NAMES = { BFS: "Belfast International Airport", BHD: "Belfast City Airport", DUB: "Dublin Airport" };
export const MEET_GREET_BENEFITS = ["Your driver meets you inside arrivals", "A personalised name board so your driver is easy to find", "Help with your luggage", "An escort from arrivals to your vehicle", "Flight monitoring and a coordinated arrival pickup", "Parking for the Meet & Greet collection included in the upgrade price"];
export function airportPickupOffers(booking: PaidBookingRecord, pricing: OwnerPricingSettings, now = new Date(), requireDelay = true, manual = false) {
  if (!booking.customerReference || !booking.customerEmail || booking.isRefundTest || booking.isAmendmentTestFixture || booking.operationalStatus === "cancelled" || ["cancelled", "refunded"].includes(booking.status) || isExecutiveVehicle(booking.vehicle ?? "")) return [];
  if (requireDelay && now.getTime() < Date.parse(booking.createdAt) + MEET_GREET_EMAIL_DELAY_MS) return [];
  const resolved = resolvePaymentAirportContextFromAddresses(booking.pickupLabel, booking.dropoffLabel);
  if (!resolved.ok || !resolved.context.isAirportTrip) return [];
  const legs = listAirportPickupLegs({ airportCode: resolved.context.airportCode, fromAirport: resolved.context.fromAirport,
    returnJourney: booking.returnJourney, isAirportToAirport: resolved.context.isAirportToAirport,
    pickupAirportCode: resolved.context.pickupAirportCode, dropoffAirportCode: resolved.context.dropoffAirportCode });
  return legs.filter(({ leg, airportCode }) => {
    const selected = leg === "return" ? booking.returnAirportAccessOption : booking.outboundAirportAccessOption ?? booking.airportAccessOption;
    const pickupAt = parseLondonLocalDateTime(leg === "return" ? booking.returnDate ?? "" : booking.tripDate, leg === "return" ? booking.returnTime ?? "" : booking.tripTime);
    return (manual || pricing.meetGreetEmail?.enabled[airportCode] === true) && selected !== "meet-greet" &&
      !booking.cancelledLegs?.includes(leg) && !(leg === "return" ? booking.returnCompletedAt : booking.outboundCompletedAt) &&
      pickupAt != null && pickupAt.getTime() > now.getTime() && meetGreetFeeGbp(airportCode, pricing.meetGreet) > 0 &&
      (!requireDelay || Date.parse(booking.createdAt) >= Date.parse(pricing.meetGreetEmail?.enabledSince[airportCode] ?? "9999-01-01"));
  });
}
export function meetGreetCheckoutReference(offer: MeetGreetUpgrade) { return `${offer.customerReference}-MG-${offer.leg === "return" ? "R" : "O"}-${offer.token.slice(0, 12)}`; }
export function verifyMeetGreetPayment(offer: MeetGreetUpgrade, checkout: { id: string; status?: string; amount?: number; currency?: string; checkout_reference?: string }) {
  return checkout.id === offer.checkoutId && checkout.status === "PAID" && checkout.currency === "GBP" &&
    checkout.checkout_reference === offer.checkoutReference && Number.isFinite(checkout.amount) && Math.abs(checkout.amount! - offer.amount) < 0.001;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export function buildMeetGreetOfferEmail(offer: MeetGreetUpgrade, name: string, siteOrigin = "https://www.myairporttaxini.co.uk") {
  const airport = MEET_GREET_AIRPORT_NAMES[offer.airport];
  const price = `£${offer.amount.toFixed(2)}`;
  const url = `${siteOrigin}/meet-and-greet/?t=${encodeURIComponent(offer.token)}`;
  const subject = `Add Meet & Greet to your ${airport} pickup — ${offer.customerReference}`;
  const intro = `Hi ${name.trim().split(/\s+/)[0] || "there"},\n\nYour transfer is confirmed. Would you like a helping hand when you arrive at ${airport}?`;
  const closing = "This optional upgrade covers your whole travelling party for this collection. Your existing transfer fare and booking remain confirmed. If you’re happy with your current pickup, there’s nothing you need to do.\n\nKind regards,\nMy Airport Taxi NI";
  const text = `${intro}\n\nMeet & Greet includes:\n${MEET_GREET_BENEFITS.map(x => `• ${x}`).join("\n")}\n\nBooking: ${offer.customerReference}\nCollection: ${formatUkDate(offer.pickupDate)}, ${formatUkTime(offer.pickupTime)}\nPickup: ${offer.pickupLabel}\nDestination: ${offer.dropoffLabel}\n\nAdd Meet & Greet for ${price}:\n${url}\n\n${closing}`;
  const html = lightCustomerEmailHtml(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#eef2f6;font-family:Arial,sans-serif;color:#14213b"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" style="max-width:600px;width:100%;background:#fff;border-radius:12px"><tr><td style="padding:26px;background:#071c38;color:#fff;text-align:center">${businessEmailLogoHtml()}</td></tr><tr><td style="padding:28px"><h1 style="font-size:25px;margin-top:0">A warm welcome at arrivals</h1><p style="line-height:1.6">${escape(intro).replace(/\n/g, "<br>")}</p><ul style="padding-left:22px;line-height:1.9">${MEET_GREET_BENEFITS.map(x => `<li>${escape(x)}</li>`).join("")}</ul><p style="line-height:1.7"><strong>Booking ${escape(offer.customerReference)}</strong><br>${escape(airport)} · ${escape(formatUkDate(offer.pickupDate))} · ${escape(formatUkTime(offer.pickupTime))}<br>${escape(offer.pickupLabel)} → ${escape(offer.dropoffLabel)}</p><p style="font-size:22px;font-weight:bold">${price} for your whole party</p><p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;padding:16px 24px;border-radius:8px;background:#0c1730;color:#fff;text-decoration:none;font-weight:bold">Add Meet &amp; Greet · ${price}</a></p><p style="line-height:1.6">${escape(closing).replace(/\n/g, "<br>")}</p></td></tr></table></td></tr></table></body></html>`);
  return { subject, text, html };
}
