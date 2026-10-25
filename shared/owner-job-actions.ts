/**
 * Owner/driver journey-card actions: Waze navigation + Call / WhatsApp.
 * Never import this from public customer pages.
 */

import { getServedAirport, matchServedAirportCode } from "./served-airports";
import { formatUkDate, formatUkTime } from "./uk-time";

const WAZE_UL = "https://waze.com/ul";
const E164_MIN = 8;
const E164_MAX = 15;

export type OwnerNavPoint = {
  label: string;
  wazeHref: string | null;
  source: "coordinates" | "address" | null;
};

export type OwnerCustomerContactActions = {
  display: string;
  telHref: string;
  whatsAppHref: string;
};

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function usableAddress(value: string | null | undefined): string {
  const label = (value || "").trim();
  if (!label || label === "—") return "";
  return label;
}

/** Official Waze universal link: opens the app on mobile, otherwise Waze web. */
export function buildWazeNavigateUrl(input: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}): string | null {
  const lat = input.lat;
  const lng = input.lng;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    isValidLatLng(lat, lng)
  ) {
    return `${WAZE_UL}?ll=${lat},${lng}&navigate=yes`;
  }
  const address = usableAddress(input.address);
  if (!address) return null;
  return `${WAZE_UL}?q=${encodeURIComponent(address)}&navigate=yes`;
}

export function coordsFromQuoteSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  end: "pickup" | "dropoff",
): { lat: number; lng: number } | null {
  if (!snapshot) return null;
  const journey =
    snapshot.journey && typeof snapshot.journey === "object"
      ? (snapshot.journey as Record<string, unknown>)
      : snapshot;
  const lat = readFiniteNumber(journey[`${end}Lat`] ?? snapshot[`${end}Lat`]);
  const lng = readFiniteNumber(journey[`${end}Lng`] ?? snapshot[`${end}Lng`]);
  if (lat == null || lng == null || !isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

export function coordsFromAirportHint(
  label?: string | null,
  airportCode?: string | null,
): { lat: number; lng: number } | null {
  const fromLabel = matchServedAirportCode(label || "");
  const code = fromLabel || (airportCode || "").trim().toUpperCase();
  if (!code) return null;
  const airport = getServedAirport(code);
  if (!airport) return null;
  return { lat: airport.lat, lng: airport.lng };
}

function storedCoords(
  lat?: number | null,
  lng?: number | null,
): { lat: number; lng: number } | null {
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    isValidLatLng(lat, lng)
  ) {
    return { lat, lng };
  }
  return null;
}

/**
 * WhatsApp international digits (no +). Does not mutate the stored customer number.
 * UK 07… → 44…; +44 / 0044 do not get a second 44; other international numbers kept.
 */
export function ownerWhatsAppDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  let value = raw.trim();
  if (!value) return "";

  if (/^00\d/.test(value)) {
    value = `+${value.slice(2)}`;
  }

  value = value.replace(/^\+44\s*\(?0\)?\s*/, "+44");

  const hasPlus = value.startsWith("+");
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("440") && digits.length >= 13 && digits.length <= 16) {
    const stripped = `44${digits.slice(3)}`;
    if (stripped.length >= E164_MIN && stripped.length <= E164_MAX) return stripped;
  }

  if (hasPlus) {
    return digits.length >= E164_MIN && digits.length <= E164_MAX ? digits : "";
  }

  if (/^07\d{8,10}$/.test(digits)) {
    const intl = `44${digits.slice(1)}`;
    return intl.length <= E164_MAX ? intl : "";
  }

  if (/^0\d{9,10}$/.test(digits)) {
    const intl = `44${digits.slice(1)}`;
    return intl.length >= E164_MIN && intl.length <= E164_MAX ? intl : "";
  }

  if (!digits.startsWith("0") && digits.length >= E164_MIN && digits.length <= E164_MAX) {
    return digits;
  }

  return "";
}

export function ownerCustomerContactActions(
  raw: string | null | undefined,
  /** Optional WhatsApp draft, e.g. {@link ownerCustomerBookingMessage}. */
  message?: string | null,
): OwnerCustomerContactActions | null {
  const display = (raw ?? "").trim();
  if (!display) return null;
  const digits = ownerWhatsAppDigits(display);
  if (!digits) return null;
  const text = message?.trim();
  return {
    display,
    telHref: `tel:+${digits}`,
    whatsAppHref: text
      ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/${digits}`,
  };
}

export type OwnerCustomerBookingMessageInput = {
  customerName?: string | null;
  customerReference?: string | null;
  /** The displayed leg's date / time / route. */
  tripDate?: string | null;
  tripTime?: string | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  returnLeg?: boolean;
  passengers?: number | null;
  suitcases?: number | null;
  flightNumber?: string | null;
  cashDueGbp?: number | null;
};

/** Booking details the owner sends the customer from the dashboard (WhatsApp or email). */
export function ownerCustomerBookingMessage(input: OwnerCustomerBookingMessageInput): string {
  const first = (input.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const ref = input.customerReference?.trim().toUpperCase();
  const date = input.tripDate?.trim() ? formatUkDate(input.tripDate.trim()) : "";
  const time = input.tripTime?.trim() ? formatUkTime(input.tripTime.trim()) : "";
  const lines = [
    `Hi ${first},`,
    "",
    `Here are your ${input.returnLeg ? "return journey" : "booking"} details with My Airport Taxi NI:`,
    "",
    ...(ref ? [`Booking ref: ${ref}`] : []),
    ...(date ? [`Date: ${date}`] : []),
    ...(time ? [`Pickup time: ${time}`] : []),
    ...(input.pickupLabel?.trim() ? [`From: ${input.pickupLabel.trim()}`] : []),
    ...(input.dropoffLabel?.trim() ? [`To: ${input.dropoffLabel.trim()}`] : []),
    ...(typeof input.passengers === "number"
      ? [`Passengers: ${input.passengers}${typeof input.suitcases === "number" ? ` · Suitcases: ${input.suitcases}` : ""}`]
      : []),
    ...(input.flightNumber?.trim() ? [`Flight: ${input.flightNumber.trim().toUpperCase()}`] : []),
    ...(typeof input.cashDueGbp === "number" && input.cashDueGbp > 0
      ? [`Cash due on the day: £${input.cashDueGbp.toFixed(2)}`]
      : []),
  ];
  return lines.join("\n");
}

/**
 * mailto: link with subject and booking details filled in. Opens the phone's
 * default email app (set Titan as the default to open it there).
 */
export function ownerCustomerEmailHref(
  email: string | null | undefined,
  input: OwnerCustomerBookingMessageInput,
): string | null {
  const to = email?.trim();
  if (!to) return null;
  const ref = input.customerReference?.trim().toUpperCase();
  const subject = `Your booking${ref ? ` ${ref}` : ""} — My Airport Taxi NI`;
  const body = ownerCustomerBookingMessage(input).replace(/\n/g, "\r\n");
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function resolveOwnerDisplayedLegNav(input: {
  displayedLeg?: "outbound" | "return" | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  quoteSnapshot?: Record<string, unknown> | null;
}): { pickup: OwnerNavPoint; destination: OwnerNavPoint } {
  const isReturn = input.displayedLeg === "return";
  const pickupLabel = usableAddress(isReturn ? input.dropoffLabel : input.pickupLabel);
  const destLabel = usableAddress(isReturn ? input.pickupLabel : input.dropoffLabel);

  const snapPickup = coordsFromQuoteSnapshot(input.quoteSnapshot, "pickup");
  const snapDropoff = coordsFromQuoteSnapshot(input.quoteSnapshot, "dropoff");
  const storedPickup = storedCoords(input.pickupLat, input.pickupLng) || snapPickup;
  const storedDropoff = storedCoords(input.dropoffLat, input.dropoffLng) || snapDropoff;

  const airportFromCode = input.airportCode
    ? coordsFromAirportHint(null, input.airportCode)
    : null;
  const outboundPickupIsAirport = input.isFromAirport === true;
  const outboundDropoffIsAirport = input.isFromAirport === false && Boolean(input.airportCode);

  function point(
    label: string,
    stored: { lat: number; lng: number } | null,
    storedEndIsAirport: boolean,
  ): OwnerNavPoint {
    const fromLabel = coordsFromAirportHint(label, null);
    const fromCode = storedEndIsAirport ? airportFromCode : null;
    const coords = stored || fromLabel || fromCode;
    const wazeHref = buildWazeNavigateUrl({
      lat: coords?.lat,
      lng: coords?.lng,
      address: label,
    });
    return {
      label: label || "—",
      wazeHref,
      source: coords ? "coordinates" : wazeHref ? "address" : null,
    };
  }

  if (isReturn) {
    return {
      pickup: point(pickupLabel, storedDropoff, outboundDropoffIsAirport),
      destination: point(destLabel, storedPickup, outboundPickupIsAirport),
    };
  }

  return {
    pickup: point(pickupLabel, storedPickup, outboundPickupIsAirport),
    destination: point(destLabel, storedDropoff, outboundDropoffIsAirport),
  };
}
