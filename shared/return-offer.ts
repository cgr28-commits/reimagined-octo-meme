/**
 * Return Journey Offer — 5% off a separate one-way return after a paid
 * one-way airport transfer. Not the existing same-order return-journey 5%.
 */

import rawConfig from "./return-offer-config.json";
import {
  getServedAirport,
  matchServedAirportCode,
  type ServedAirportCode,
} from "./served-airports";

export type ReturnOfferStatus =
  | "NOT_ELIGIBLE"
  | "ELIGIBLE"
  | "SCHEDULED"
  | "SENT"
  | "REDEEMED"
  | "CANCELLED"
  | "EXPIRED";

export type ReturnOfferDirection = "local_to_airport" | "airport_to_local";

export type ReturnOfferConfig = {
  discountRate: number;
  localToAirportOfferDelayHours: number;
  lastMinuteLocalOfferDelayHours: number;
  localToAirportMinLeadHours: number;
  airportToLocalOfferDelayHoursAfterCompletion: number;
  assumedAirportToLocalDurationMinutes: number;
  offerExpiryDays: number;
};

function asPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const raw = rawConfig as Record<string, unknown>;

export const RETURN_OFFER_CONFIG: ReturnOfferConfig = {
  discountRate: asPositiveNumber(raw.discountRate, 0.05),
  localToAirportOfferDelayHours: asPositiveNumber(raw.localToAirportOfferDelayHours, 48),
  lastMinuteLocalOfferDelayHours: asPositiveNumber(raw.lastMinuteLocalOfferDelayHours, 12),
  localToAirportMinLeadHours: asPositiveNumber(raw.localToAirportMinLeadHours, 48),
  airportToLocalOfferDelayHoursAfterCompletion: asPositiveNumber(
    raw.airportToLocalOfferDelayHoursAfterCompletion,
    24,
  ),
  assumedAirportToLocalDurationMinutes: asPositiveNumber(
    raw.assumedAirportToLocalDurationMinutes,
    120,
  ),
  offerExpiryDays: asPositiveNumber(raw.offerExpiryDays, 30),
};

export function resolveReturnOfferConfig(
  env?: {
    RETURN_OFFER_LOCAL_TO_AIRPORT_DELAY_HOURS?: string;
    RETURN_OFFER_LAST_MINUTE_LOCAL_DELAY_HOURS?: string;
    RETURN_OFFER_AIRPORT_TO_LOCAL_DELAY_HOURS?: string;
  },
): ReturnOfferConfig {
  return {
    ...RETURN_OFFER_CONFIG,
    localToAirportOfferDelayHours: asPositiveNumber(
      env?.RETURN_OFFER_LOCAL_TO_AIRPORT_DELAY_HOURS,
      RETURN_OFFER_CONFIG.localToAirportOfferDelayHours,
    ),
    lastMinuteLocalOfferDelayHours: asPositiveNumber(
      env?.RETURN_OFFER_LAST_MINUTE_LOCAL_DELAY_HOURS,
      RETURN_OFFER_CONFIG.lastMinuteLocalOfferDelayHours,
    ),
    airportToLocalOfferDelayHoursAfterCompletion: asPositiveNumber(
      env?.RETURN_OFFER_AIRPORT_TO_LOCAL_DELAY_HOURS,
      RETURN_OFFER_CONFIG.airportToLocalOfferDelayHoursAfterCompletion,
    ),
  };
}

export type ReturnOfferBookingSnapshot = {
  paymentReference: string;
  customerEmail?: string;
  customerName?: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  airportCode?: string;
  isFromAirport?: boolean;
  isAirportTrip?: boolean;
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  createdAt: string;
  tripDate: string;
  tripTime: string;
  journeyDuration?: string;
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
};

export type ReturnOfferPlaceSnapshot = {
  placeId: string;
  formattedAddress: string;
  displayAddress?: string;
  placeName?: string | null;
  lat: number;
  lng: number;
  postalCode?: string | null;
  countryCode?: string | null;
  streetNumber?: string | null;
  route?: string | null;
  locality?: string | null;
  administrativeArea?: string | null;
};

export type ReturnOfferRecord = {
  id: string;
  originalPaymentReference: string;
  customerEmail: string;
  customerName: string;
  direction: ReturnOfferDirection;
  airportCode: ServedAirportCode;
  airportName: string;
  originalPickupLabel: string;
  originalDropoffLabel: string;
  reversedPickupLabel: string;
  reversedDropoffLabel: string;
  /** Quote-ready reversed pickup when the original booking had validated place data. */
  reversedPickupPlace?: ReturnOfferPlaceSnapshot;
  /** Quote-ready reversed drop-off when the original booking had validated place data. */
  reversedDropoffPlace?: ReturnOfferPlaceSnapshot;
  tokenHash: string;
  status: ReturnOfferStatus;
  ineligibleReason?: string;
  scheduledAt?: string;
  emailSentAt?: string;
  sendClaimId?: string;
  sendClaimedAt?: string;
  redeemedAt?: string;
  returnBookingPaymentReference?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReturnOfferPublicSnapshot = {
  direction: ReturnOfferDirection;
  airportCode: ServedAirportCode;
  airportName: string;
  pickupLabel: string;
  dropoffLabel: string;
  localAddressLabel: string;
  discountPercentLabel: string;
  pickupPlace?: ReturnOfferPlaceSnapshot;
  dropoffPlace?: ReturnOfferPlaceSnapshot;
};

export type ReturnOfferEligibilityResult = {
  eligible: boolean;
  reason: string;
  direction?: ReturnOfferDirection;
  airportCode?: ServedAirportCode;
};

const AIRPORT_NAMES: Record<ServedAirportCode, string> = {
  BFS: "Belfast International Airport",
  BHD: "Belfast City Airport",
  DUB: "Dublin Airport",
  LDY: "City of Derry Airport",
};

export function airportDisplayName(code: ServedAirportCode): string {
  return AIRPORT_NAMES[code];
}

export function formatReturnOfferPercent(
  rate: number = RETURN_OFFER_CONFIG.discountRate,
): string {
  const pct = Math.round(Number(rate) * 100);
  return Number.isFinite(pct) && pct > 0 ? `${pct}%` : "5%";
}

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

export function applyReturnOfferSaving(
  journeyFareGbp: number,
  rate: number = RETURN_OFFER_CONFIG.discountRate,
): { savingGbp: number; fareAfterGbp: number } {
  const fare = roundGbp(Math.max(0, Number(journeyFareGbp) || 0));
  const safeRate = Number(rate);
  if (!Number.isFinite(fare) || fare <= 0 || !(safeRate > 0 && safeRate < 1)) {
    return { savingGbp: 0, fareAfterGbp: fare };
  }
  const savingGbp = roundGbp(fare * safeRate);
  return { savingGbp, fareAfterGbp: roundGbp(Math.max(0, fare - savingGbp)) };
}

export function normalizeJourneyLabel(label: string): string {
  return String(label ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function labelsLookLikeReverse(
  originalPickup: string,
  originalDropoff: string,
  candidatePickup: string,
  candidateDropoff: string,
): boolean {
  const aPick = normalizeJourneyLabel(originalPickup);
  const aDrop = normalizeJourneyLabel(originalDropoff);
  const bPick = normalizeJourneyLabel(candidatePickup);
  const bDrop = normalizeJourneyLabel(normalizeJourneyLabel(candidateDropoff) ? candidateDropoff : "");
  if (!aPick || !aDrop || !bPick || !bDrop) return false;
  const pickupMatchesDrop =
    bPick.includes(aDrop) || aDrop.includes(bPick) || bPick === aDrop;
  const dropMatchesPickup =
    bDrop.includes(aPick) || aPick.includes(bDrop) || bDrop === aPick;
  return pickupMatchesDrop && dropMatchesPickup;
}

export function detectReturnOfferAirport(booking: {
  pickupLabel?: string;
  dropoffLabel?: string;
  airportCode?: string;
}): ServedAirportCode | null {
  const fromCode = matchServedAirportCode(booking.airportCode ?? "");
  if (fromCode) return fromCode;
  return (
    matchServedAirportCode(booking.pickupLabel ?? "") ||
    matchServedAirportCode(booking.dropoffLabel ?? "")
  );
}

export function resolveReturnOfferDirection(booking: {
  pickupLabel?: string;
  dropoffLabel?: string;
  isFromAirport?: boolean;
  airportCode?: string;
}): ReturnOfferDirection | null {
  const airport = detectReturnOfferAirport(booking);
  if (!airport) return null;
  const pickupAirport = matchServedAirportCode(booking.pickupLabel ?? "");
  const dropoffAirport = matchServedAirportCode(booking.dropoffLabel ?? "");
  if (booking.isFromAirport === true || (pickupAirport && !dropoffAirport)) {
    return "airport_to_local";
  }
  if (booking.isFromAirport === false || (dropoffAirport && !pickupAirport)) {
    return "local_to_airport";
  }
  if (pickupAirport && !dropoffAirport) return "airport_to_local";
  if (dropoffAirport && !pickupAirport) return "local_to_airport";
  return "local_to_airport";
}

function isInvalidatingMoneyStatus(status?: string): boolean {
  const value = String(status ?? "").toLowerCase();
  return (
    value === "cancelled" ||
    value === "refunded" ||
    value === "fully_refunded"
  );
}

export function isEligibleForReturnOffer(
  booking: ReturnOfferBookingSnapshot,
  options?: {
    offerAlreadySent?: boolean;
    correspondingReturnBooked?: boolean;
    now?: Date;
  },
): ReturnOfferEligibilityResult {
  if (booking.isRefundTest || booking.isAmendmentTestFixture) {
    return { eligible: false, reason: "operational_test" };
  }
  if (booking.returnJourney === true || booking.returnDate?.trim() || booking.returnTime?.trim()) {
    return { eligible: false, reason: "return_already_included" };
  }
  if (isInvalidatingMoneyStatus(booking.status) || booking.operationalStatus === "cancelled") {
    return { eligible: false, reason: "cancelled_or_refunded" };
  }
  if (booking.paymentStatus === "fully_refunded") {
    return { eligible: false, reason: "cancelled_or_refunded" };
  }
  const email = String(booking.customerEmail ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { eligible: false, reason: "missing_email" };
  }
  const airportCode = detectReturnOfferAirport(booking);
  if (!airportCode) {
    return { eligible: false, reason: "not_airport_transfer" };
  }
  const direction = resolveReturnOfferDirection({
    pickupLabel: booking.pickupLabel,
    dropoffLabel: booking.dropoffLabel,
    isFromAirport: booking.isFromAirport,
    airportCode,
  });
  if (!direction) {
    return { eligible: false, reason: "not_airport_transfer" };
  }
  if (options?.offerAlreadySent) {
    return { eligible: false, reason: "offer_already_sent", direction, airportCode };
  }
  if (options?.correspondingReturnBooked) {
    return { eligible: false, reason: "corresponding_return_booked", direction, airportCode };
  }
  return { eligible: true, reason: "eligible", direction, airportCode };
}

export function hasCorrespondingReturnBooking(
  original: Pick<ReturnOfferBookingSnapshot, "pickupLabel" | "dropoffLabel" | "customerEmail" | "paymentReference">,
  candidates: Array<Pick<ReturnOfferBookingSnapshot, "pickupLabel" | "dropoffLabel" | "customerEmail" | "paymentReference" | "status" | "returnJourney">>,
): boolean {
  const email = normalizeJourneyLabel(original.customerEmail ?? "");
  if (!email) return false;
  return candidates.some((candidate) => {
    if (candidate.paymentReference === original.paymentReference) return false;
    if (isInvalidatingMoneyStatus(candidate.status)) return false;
    if (normalizeJourneyLabel(candidate.customerEmail ?? "") !== email) return false;
    return labelsLookLikeReverse(
      original.pickupLabel,
      original.dropoffLabel,
      candidate.pickupLabel,
      candidate.dropoffLabel,
    );
  });
}

export function parseBookingDateTime(tripDate: string, tripTime: string): Date | null {
  const date = String(tripDate ?? "").trim();
  const time = String(tripTime ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hhmm = time.length >= 5 ? time.slice(0, 5) : "";
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const parsed = new Date(`${date}T${hhmm}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDurationMinutes(label?: string): number | null {
  const raw = String(label ?? "");
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minMatch = raw.match(/(\d+)\s*m/i);
  let minutes = 0;
  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minMatch) minutes += Number(minMatch[1]);
  return minutes > 0 ? minutes : null;
}

export function resolveAirportToLocalCompletionAt(
  booking: ReturnOfferBookingSnapshot,
  journeyCompletedAt?: string | null,
  config: ReturnOfferConfig = RETURN_OFFER_CONFIG,
): Date | null {
  if (journeyCompletedAt?.trim()) {
    const completed = new Date(journeyCompletedAt);
    if (!Number.isNaN(completed.getTime())) return completed;
  }
  const pickupAt = parseBookingDateTime(booking.tripDate, booking.tripTime);
  if (!pickupAt) return null;
  const duration =
    parseDurationMinutes(booking.journeyDuration) ??
    config.assumedAirportToLocalDurationMinutes;
  return new Date(pickupAt.getTime() + duration * 60_000);
}

export type ReturnOfferScheduleResult = {
  scheduledAt: string | null;
  reason: string;
};

export function resolveReturnOfferSchedule(
  booking: ReturnOfferBookingSnapshot,
  input: {
    direction: ReturnOfferDirection;
    now?: Date;
    journeyCompletedAt?: string | null;
    config?: ReturnOfferConfig;
  },
): ReturnOfferScheduleResult {
  const config = input.config ?? RETURN_OFFER_CONFIG;
  const now = input.now ?? new Date();
  const createdAt = new Date(booking.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return { scheduledAt: null, reason: "invalid_created_at" };
  }

  if (input.direction === "airport_to_local") {
    const completedAt = resolveAirportToLocalCompletionAt(
      booking,
      input.journeyCompletedAt,
      config,
    );
    if (!completedAt) {
      return { scheduledAt: null, reason: "awaiting_completion" };
    }
    if (now.getTime() < completedAt.getTime()) {
      return { scheduledAt: null, reason: "awaiting_completion" };
    }
    const scheduled = new Date(
      completedAt.getTime() +
        config.airportToLocalOfferDelayHoursAfterCompletion * 60 * 60 * 1000,
    );
    return { scheduledAt: scheduled.toISOString(), reason: "after_completion" };
  }

  const tripAt = parseBookingDateTime(booking.tripDate, booking.tripTime);
  if (!tripAt) {
    return { scheduledAt: null, reason: "invalid_trip_datetime" };
  }
  if (tripAt.getTime() <= now.getTime()) {
    return { scheduledAt: null, reason: "outbound_already_passed" };
  }

  const defaultDelayMs = config.localToAirportOfferDelayHours * 60 * 60 * 1000;
  const lastMinuteDelayMs = config.lastMinuteLocalOfferDelayHours * 60 * 60 * 1000;
  const minLeadMs = config.localToAirportMinLeadHours * 60 * 60 * 1000;
  const defaultSendAt = new Date(createdAt.getTime() + defaultDelayMs);
  const lastMinuteSendAt = new Date(createdAt.getTime() + lastMinuteDelayMs);

  if (tripAt.getTime() - defaultSendAt.getTime() >= minLeadMs) {
    return { scheduledAt: defaultSendAt.toISOString(), reason: "standard_local_delay" };
  }
  if (lastMinuteSendAt.getTime() < tripAt.getTime()) {
    return { scheduledAt: lastMinuteSendAt.toISOString(), reason: "last_minute_local_delay" };
  }
  return { scheduledAt: null, reason: "too_close_to_outbound" };
}

export function generateReturnOfferToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeReturnOfferToken(token: string): string {
  return String(token ?? "").trim().toLowerCase();
}

export async function hashReturnOfferToken(token: string): Promise<string> {
  const normalized = normalizeReturnOfferToken(token);
  const encoded = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function returnOfferTokenKey(tokenHash: string): string {
  return `return-offer:token:${tokenHash.trim()}`;
}

export function returnOfferBookingKey(paymentReference: string): string {
  return `return-offer:booking:${paymentReference.trim()}`;
}

export function returnOfferOpenIndexKey(): string {
  return "return-offer:open-index";
}

export function isConfirmedReturnOfferPlace(
  place?: ReturnOfferPlaceSnapshot | null,
): place is ReturnOfferPlaceSnapshot {
  return Boolean(
    place?.placeId?.trim() &&
      place.formattedAddress?.trim() &&
      typeof place.lat === "number" &&
      typeof place.lng === "number" &&
      Number.isFinite(place.lat) &&
      Number.isFinite(place.lng),
  );
}

export function normalizeReturnOfferPlace(
  place?: Partial<ReturnOfferPlaceSnapshot> | null,
): ReturnOfferPlaceSnapshot | undefined {
  if (!place) return undefined;
  const next: ReturnOfferPlaceSnapshot = {
    placeId: String(place.placeId ?? "").trim(),
    formattedAddress: String(place.formattedAddress ?? "").trim(),
    displayAddress: String(place.displayAddress ?? place.formattedAddress ?? "").trim() || undefined,
    placeName: place.placeName ?? null,
    lat: Number(place.lat),
    lng: Number(place.lng),
    postalCode: place.postalCode ?? null,
    countryCode: place.countryCode ?? null,
    streetNumber: place.streetNumber ?? null,
    route: place.route ?? null,
    locality: place.locality ?? null,
    administrativeArea: place.administrativeArea ?? null,
  };
  return isConfirmedReturnOfferPlace(next) ? next : undefined;
}

export function returnOfferPlaceFromServedAirport(
  airportCode: ServedAirportCode,
): ReturnOfferPlaceSnapshot | undefined {
  const airport = getServedAirport(airportCode);
  if (!airport) return undefined;
  return normalizeReturnOfferPlace({
    placeId: airport.placeId,
    formattedAddress: airport.formattedAddress,
    displayAddress: airport.formattedAddress,
    placeName: airport.name,
    lat: airport.lat,
    lng: airport.lng,
    postalCode: airport.postalCode,
    countryCode: airport.countryCode,
  });
}

/**
 * Confirmed pickup/drop-off for the reversed return journey.
 * Airport side always comes from the served-airport catalogue.
 * Local side is confirmed only when original-booking place metadata is present.
 */
export function buildReturnOfferConfirmedPlaces(input: {
  direction: ReturnOfferDirection;
  airportCode: ServedAirportCode;
  localPlace?: ReturnOfferPlaceSnapshot | null;
  localAddressLabel?: string;
}): {
  pickupPlace?: ReturnOfferPlaceSnapshot;
  dropoffPlace?: ReturnOfferPlaceSnapshot;
} {
  const airport = returnOfferPlaceFromServedAirport(input.airportCode);
  const local = normalizeReturnOfferPlace(input.localPlace);
  const labelledLocal =
    local && input.localAddressLabel?.trim()
      ? {
          ...local,
          displayAddress: input.localAddressLabel.trim(),
          formattedAddress: local.formattedAddress || input.localAddressLabel.trim(),
        }
      : local;

  if (input.direction === "local_to_airport") {
    return { pickupPlace: airport, dropoffPlace: labelledLocal };
  }
  return { pickupPlace: labelledLocal, dropoffPlace: airport };
}

export function returnOfferPlacesReadyForQuote(snapshot: {
  pickupPlace?: ReturnOfferPlaceSnapshot | null;
  dropoffPlace?: ReturnOfferPlaceSnapshot | null;
}): boolean {
  return (
    isConfirmedReturnOfferPlace(snapshot.pickupPlace) &&
    isConfirmedReturnOfferPlace(snapshot.dropoffPlace)
  );
}

export function buildReturnOfferPublicSnapshot(
  record: Pick<
    ReturnOfferRecord,
    | "direction"
    | "airportCode"
    | "airportName"
    | "reversedPickupLabel"
    | "reversedDropoffLabel"
    | "reversedPickupPlace"
    | "reversedDropoffPlace"
  >,
): ReturnOfferPublicSnapshot {
  const localAddressLabel =
    record.direction === "local_to_airport"
      ? record.reversedDropoffLabel
      : record.reversedPickupLabel;
  const storedLocal =
    record.direction === "local_to_airport"
      ? record.reversedDropoffPlace
      : record.reversedPickupPlace;
  const places = buildReturnOfferConfirmedPlaces({
    direction: record.direction,
    airportCode: record.airportCode,
    localPlace: storedLocal,
    localAddressLabel,
  });
  return {
    direction: record.direction,
    airportCode: record.airportCode,
    airportName: record.airportName,
    pickupLabel: record.reversedPickupLabel,
    dropoffLabel: record.reversedDropoffLabel,
    localAddressLabel,
    discountPercentLabel: formatReturnOfferPercent(),
    ...places,
  };
}

export function buildReturnOfferCustomerUrl(
  siteOrigin: string,
  token: string,
): string {
  const origin = siteOrigin.replace(/\/$/, "");
  return `${origin}/book?returnOffer=${encodeURIComponent(normalizeReturnOfferToken(token))}`;
}

export function firstNameFromCustomerName(name: string): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

export function isReturnOfferAirportJourney(pickupLabel: string, dropoffLabel: string): boolean {
  return Boolean(
    matchServedAirportCode(pickupLabel) || matchServedAirportCode(dropoffLabel),
  );
}

export const RETURN_OFFER_TTL_SECONDS = 60 * 60 * 24 * 120;
export const RETURN_OFFER_CLAIM_MS = 30 * 60 * 1000;

export function generateReturnOfferId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function paidBookingToReturnOfferSnapshot(booking: {
  paymentReference: string;
  customerEmail?: string;
  customerName?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  airportCode?: string;
  isFromAirport?: boolean;
  isAirportTrip?: boolean;
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  createdAt: string;
  tripDate?: string;
  tripTime?: string;
  journeyDuration?: string;
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
}): ReturnOfferBookingSnapshot {
  return {
    paymentReference: booking.paymentReference,
    customerEmail: booking.customerEmail,
    customerName: booking.customerName,
    pickupLabel: booking.pickupLabel ?? "",
    dropoffLabel: booking.dropoffLabel ?? "",
    returnJourney: booking.returnJourney,
    returnDate: booking.returnDate,
    returnTime: booking.returnTime,
    airportCode: booking.airportCode,
    isFromAirport: booking.isFromAirport,
    isAirportTrip: booking.isAirportTrip,
    status: booking.status,
    operationalStatus: booking.operationalStatus,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt,
    tripDate: booking.tripDate ?? "",
    tripTime: booking.tripTime ?? "",
    journeyDuration: booking.journeyDuration,
    isRefundTest: booking.isRefundTest,
    isAmendmentTestFixture: booking.isAmendmentTestFixture,
  };
}

export function returnOfferIneligibleReasonLabel(reason: string): string {
  switch (reason) {
    case "return_already_included":
      return "Return already included in original booking";
    case "corresponding_return_booked":
      return "Customer booked the return separately";
    case "cancelled_or_refunded":
      return "Booking cancelled or refunded";
    case "missing_email":
      return "No valid customer email";
    case "not_airport_transfer":
      return "Not a supported airport transfer";
    case "offer_already_sent":
      return "Offer already sent";
    case "offer_already_redeemed":
      return "Offer already redeemed";
    case "not_paid":
      return "Booking is not a paid airport transfer";
    case "manual_send":
      return "";
    case "operational_test":
      return "Operational test booking";
    case "awaiting_completion":
      return "Waiting for airport arrival journey to complete";
    case "too_close_to_outbound":
      return "Too close to the outbound journey";
    case "outbound_already_passed":
      return "Outbound journey already passed";
    case "invalid_trip_datetime":
      return "Outbound date or time is missing";
    case "eligible":
      return "";
    default:
      return reason.replace(/_/g, " ");
  }
}

export function returnOfferDirectionLabel(direction?: ReturnOfferDirection): string {
  return direction === "airport_to_local" ? "Airport → Local" : "Local → Airport";
}

export function isReturnOfferExpired(
  record: Pick<ReturnOfferRecord, "status" | "expiresAt">,
  now = new Date(),
): boolean {
  if (record.status === "EXPIRED") return true;
  if (!record.expiresAt?.trim()) return false;
  const expires = new Date(record.expiresAt);
  return !Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime();
}

export function evaluateReturnOfferAccess(
  record: ReturnOfferRecord | null,
  now = new Date(),
): { ok: boolean; reason: string } {
  if (!record) return { ok: false, reason: "invalid_token" };
  if (record.status === "REDEEMED") return { ok: false, reason: "redeemed" };
  if (record.status === "CANCELLED" || record.status === "NOT_ELIGIBLE") {
    return { ok: false, reason: "not_available" };
  }
  if (isReturnOfferExpired(record, now)) return { ok: false, reason: "expired" };
  if (record.status !== "SENT") return { ok: false, reason: "not_available" };
  return { ok: true, reason: "ok" };
}

export function shouldApplyReturnOfferDiscount(input: {
  tokenValid: boolean;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney?: boolean;
}): boolean {
  if (!input.tokenValid) return false;
  if (input.returnJourney) return false;
  return isReturnOfferAirportJourney(input.pickupLabel, input.dropoffLabel);
}

export type ReturnOfferProcessPlan = {
  eligible: boolean;
  reason: string;
  direction?: ReturnOfferDirection;
  airportCode?: ServedAirportCode;
  status: ReturnOfferStatus;
  scheduledAt?: string;
  shouldSend: boolean;
};

export function planReturnOfferProcessing(input: {
  booking: ReturnOfferBookingSnapshot;
  existing?: Pick<ReturnOfferRecord, "status" | "emailSentAt"> | null;
  correspondingReturnBooked: boolean;
  journeyCompletedAt?: string | null;
  now?: Date;
  config?: ReturnOfferConfig;
}): ReturnOfferProcessPlan {
  const now = input.now ?? new Date();
  const alreadySent =
    input.existing?.status === "SENT" ||
    input.existing?.status === "REDEEMED" ||
    Boolean(input.existing?.emailSentAt);

  if (input.existing?.status === "REDEEMED") {
    return {
      eligible: false,
      reason: "offer_already_sent",
      status: "REDEEMED",
      shouldSend: false,
    };
  }

  const eligibility = isEligibleForReturnOffer(input.booking, {
    offerAlreadySent: alreadySent,
    correspondingReturnBooked: input.correspondingReturnBooked,
    now,
  });

  if (!eligibility.eligible) {
    const status: ReturnOfferStatus = alreadySent
      ? "SENT"
      : eligibility.reason === "cancelled_or_refunded" ||
          eligibility.reason === "corresponding_return_booked"
        ? "CANCELLED"
        : "NOT_ELIGIBLE";
    return {
      eligible: false,
      reason: eligibility.reason,
      direction: eligibility.direction,
      airportCode: eligibility.airportCode,
      status,
      shouldSend: false,
    };
  }

  const schedule = resolveReturnOfferSchedule(input.booking, {
    direction: eligibility.direction!,
    now,
    journeyCompletedAt: input.journeyCompletedAt,
    config: input.config,
  });

  if (!schedule.scheduledAt) {
    const status: ReturnOfferStatus =
      schedule.reason === "awaiting_completion" ? "ELIGIBLE" : "NOT_ELIGIBLE";
    return {
      eligible: schedule.reason === "awaiting_completion",
      reason: schedule.reason,
      direction: eligibility.direction,
      airportCode: eligibility.airportCode,
      status,
      shouldSend: false,
    };
  }

  const due = new Date(schedule.scheduledAt).getTime() <= now.getTime();
  return {
    eligible: true,
    reason: schedule.reason,
    direction: eligibility.direction,
    airportCode: eligibility.airportCode,
    status: "SCHEDULED",
    scheduledAt: schedule.scheduledAt,
    shouldSend: due && !alreadySent,
  };
}

/**
 * Owner “Send now” planner. Reuses eligibility/security, but skips the
 * automatic waiting delay (48h / 12h / 24h after completion).
 */
export function planManualReturnOfferSend(input: {
  booking: ReturnOfferBookingSnapshot;
  existing?: Pick<ReturnOfferRecord, "status" | "emailSentAt"> | null;
  correspondingReturnBooked: boolean;
  journeyCompletedAt?: string | null;
  now?: Date;
  config?: ReturnOfferConfig;
}): ReturnOfferProcessPlan {
  const now = input.now ?? new Date();
  const alreadySent =
    input.existing?.status === "SENT" ||
    input.existing?.status === "REDEEMED" ||
    Boolean(input.existing?.emailSentAt);

  if (input.existing?.status === "REDEEMED") {
    return {
      eligible: false,
      reason: "offer_already_redeemed",
      status: "REDEEMED",
      shouldSend: false,
    };
  }

  if (alreadySent) {
    return {
      eligible: false,
      reason: "offer_already_sent",
      status: "SENT",
      shouldSend: false,
    };
  }

  const paidStatus = String(input.booking.paymentStatus ?? "").toLowerCase();
  if (paidStatus && paidStatus !== "paid" && paidStatus !== "partially_refunded") {
    return {
      eligible: false,
      reason: "not_paid",
      status: "NOT_ELIGIBLE",
      shouldSend: false,
    };
  }

  const eligibility = isEligibleForReturnOffer(input.booking, {
    offerAlreadySent: false,
    correspondingReturnBooked: input.correspondingReturnBooked,
    now,
  });

  if (!eligibility.eligible) {
    const status: ReturnOfferStatus =
      eligibility.reason === "cancelled_or_refunded" ||
      eligibility.reason === "corresponding_return_booked"
        ? "CANCELLED"
        : "NOT_ELIGIBLE";
    return {
      eligible: false,
      reason: eligibility.reason,
      direction: eligibility.direction,
      airportCode: eligibility.airportCode,
      status,
      shouldSend: false,
    };
  }

  if (eligibility.direction === "airport_to_local") {
    const completedAt = resolveAirportToLocalCompletionAt(
      input.booking,
      input.journeyCompletedAt,
      input.config,
    );
    if (!completedAt || now.getTime() < completedAt.getTime()) {
      return {
        eligible: true,
        reason: "awaiting_completion",
        direction: eligibility.direction,
        airportCode: eligibility.airportCode,
        status: "ELIGIBLE",
        shouldSend: false,
      };
    }
  }

  return {
    eligible: true,
    reason: "manual_send",
    direction: eligibility.direction,
    airportCode: eligibility.airportCode,
    status: "ELIGIBLE",
    shouldSend: true,
  };
}

export function buildReturnOfferAdminSummary(input: {
  booking: ReturnOfferBookingSnapshot;
  record?: ReturnOfferRecord | null;
  correspondingReturnBooked?: boolean;
  journeyCompletedAt?: string | null;
  now?: Date;
}): {
  eligible: boolean;
  reason: string;
  type?: string;
  status: ReturnOfferStatus;
  scheduledAt?: string;
  sentAt?: string;
  redeemed: boolean;
  returnBookingPaymentReference?: string;
  canSendNow?: boolean;
  sendBlockedReason?: string;
} {
  const manual = planManualReturnOfferSend({
    booking: input.booking,
    existing: input.record,
    correspondingReturnBooked: Boolean(input.correspondingReturnBooked),
    journeyCompletedAt: input.journeyCompletedAt,
    now: input.now,
  });
  const record = input.record;
  if (record) {
    return {
      eligible: record.status !== "NOT_ELIGIBLE" && record.status !== "CANCELLED",
      reason: returnOfferIneligibleReasonLabel(record.ineligibleReason || ""),
      type: returnOfferDirectionLabel(record.direction),
      status: record.status,
      scheduledAt: record.scheduledAt,
      sentAt: record.emailSentAt,
      redeemed: record.status === "REDEEMED",
      returnBookingPaymentReference: record.returnBookingPaymentReference,
      canSendNow: manual.shouldSend,
      sendBlockedReason: manual.shouldSend
        ? undefined
        : returnOfferIneligibleReasonLabel(manual.reason),
    };
  }
  const plan = planReturnOfferProcessing({
    booking: input.booking,
    correspondingReturnBooked: Boolean(input.correspondingReturnBooked),
    now: input.now,
  });
  return {
    eligible: plan.eligible,
    reason: returnOfferIneligibleReasonLabel(plan.reason),
    type: plan.direction ? returnOfferDirectionLabel(plan.direction) : undefined,
    status: plan.status,
    scheduledAt: plan.scheduledAt,
    redeemed: false,
    canSendNow: manual.shouldSend,
    sendBlockedReason: manual.shouldSend
      ? undefined
      : returnOfferIneligibleReasonLabel(manual.reason),
  };
}
