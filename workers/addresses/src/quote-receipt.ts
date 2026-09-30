/**
 * Signed open-website quote receipt.
 *
 * Issued only while profitability protection is active. The browser can carry
 * the token, but it cannot read a signing secret and it cannot change the
 * signed fare. The payload is the customer fare plus the journey inputs that
 * payment already knows. It must not contain the operating base, positioning
 * miles, MPG, diesel, wear, the hourly target, or the profitability floor.
 */

import { SERVED_AIRPORTS } from "../shared/served-airports";

/**
 * Checked when the customer starts payment, before SumUp checkout is created.
 * Card entry then uses SumUp's own session.
 *
 * Three hours covers the public booking form, including a pause to check a
 * flight or agree a return. The public flow has no shorter countdown today.
 * A quote left overnight must be refreshed. An owner price change invalidates
 * the receipt immediately through the pricing version, so expiry is not the
 * only control.
 */
export const QUOTE_RECEIPT_TTL_SECONDS = 3 * 60 * 60;

export const QUOTE_RECEIPT_REFRESH_MESSAGE =
  "Quote amount is out of date. Please refresh your quote and try again.";

export type QuoteReceiptClaims = {
  exp: number;
  pricingVersion: number;
  pickupPlaceId: string;
  dropoffPlaceId: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  passengers: number;
  suitcases: number;
  outboundDate: string;
  outboundTime: string;
  returnJourney: boolean;
  returnDate: string;
  returnTime: string;
  journeyFareGbp: number;
  airportFixedCostsGbp: number;
  nightWeekendSurchargeGbp: number;
  transferAmountGbp: number;
  /** Passenger route only. Already shown on the quote. Not positioning miles. */
  distanceKm: number;
  durationMinutes: number;
};

export type QuoteReceiptJourney = Omit<
  QuoteReceiptClaims,
  | "exp"
  | "journeyFareGbp"
  | "airportFixedCostsGbp"
  | "nightWeekendSurchargeGbp"
  | "transferAmountGbp"
  | "distanceKm"
  | "durationMinutes"
>;

export type QuoteReceiptDecision =
  | { action: "not_required" }
  | { action: "refresh"; reason: string }
  | { action: "accept"; claims: QuoteReceiptClaims };

const CLAIM_KEYS = [
  "exp",
  "pricingVersion",
  "pickupPlaceId",
  "dropoffPlaceId",
  "pickupAddress",
  "dropoffAddress",
  "vehicleType",
  "passengers",
  "suitcases",
  "outboundDate",
  "outboundTime",
  "returnJourney",
  "returnDate",
  "returnTime",
  "journeyFareGbp",
  "airportFixedCostsGbp",
  "nightWeekendSurchargeGbp",
  "transferAmountGbp",
  "distanceKm",
  "durationMinutes",
] as const;

export function normalizeReceiptText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Airport quick-select labels and full catalogue addresses must compare equal
 * without treating a street that merely mentions a town as an airport.
 */
export function canonicalJourneyEndpoint(value: unknown): string {
  const text = normalizeReceiptText(value);
  if (!text) return "";
  const lower = text.toLowerCase();
  for (const airport of SERVED_AIRPORTS) {
    const name = airport.name.toLowerCase();
    const formatted = airport.formattedAddress.toLowerCase();
    if (lower === name || lower === airport.label.toLowerCase() || lower === formatted) {
      return `airport:${airport.code}`;
    }
    if (lower.startsWith(`${name},`) || lower.startsWith(`${name} `)) {
      return `airport:${airport.code}`;
    }
  }
  return lower;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!value || /[^A-Za-z0-9_-]/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function canonicalClaims(claims: QuoteReceiptClaims): string {
  const record: Record<string, string | number | boolean> = {};
  for (const key of CLAIM_KEYS) record[key] = claims[key];
  return JSON.stringify(record);
}

function readClaims(parsed: unknown): QuoteReceiptClaims | null {
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  const passengers = Number(raw.passengers);
  const suitcases = Number(raw.suitcases);
  const pricingVersion = Number(raw.pricingVersion);
  const exp = Number(raw.exp);
  const journeyFareGbp = Number(raw.journeyFareGbp);
  const airportFixedCostsGbp = Number(raw.airportFixedCostsGbp);
  const nightWeekendSurchargeGbp = Number(raw.nightWeekendSurchargeGbp);
  const transferAmountGbp = Number(raw.transferAmountGbp);
  const distanceKm = Number(raw.distanceKm);
  const durationMinutes = Number(raw.durationMinutes);
  if (!Number.isInteger(exp) || exp <= 0) return null;
  if (!Number.isInteger(pricingVersion) || pricingVersion < 1) return null;
  if (!Number.isInteger(passengers) || passengers < 1) return null;
  if (!Number.isInteger(suitcases) || suitcases < 0) return null;
  if (![journeyFareGbp, airportFixedCostsGbp, nightWeekendSurchargeGbp, transferAmountGbp].every(Number.isFinite)) {
    return null;
  }
  if (journeyFareGbp < 0 || transferAmountGbp < 1) return null;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  if (typeof raw.returnJourney !== "boolean") return null;
  if (typeof raw.vehicleType !== "string" || !raw.vehicleType.trim()) return null;
  return {
    exp,
    pricingVersion,
    pickupPlaceId: normalizeReceiptText(raw.pickupPlaceId),
    dropoffPlaceId: normalizeReceiptText(raw.dropoffPlaceId),
    pickupAddress: normalizeReceiptText(raw.pickupAddress),
    dropoffAddress: normalizeReceiptText(raw.dropoffAddress),
    vehicleType: normalizeReceiptText(raw.vehicleType),
    passengers,
    suitcases,
    outboundDate: normalizeReceiptText(raw.outboundDate),
    outboundTime: normalizeReceiptText(raw.outboundTime),
    returnJourney: raw.returnJourney,
    returnDate: raw.returnJourney ? normalizeReceiptText(raw.returnDate) : "",
    returnTime: raw.returnJourney ? normalizeReceiptText(raw.returnTime) : "",
    journeyFareGbp: money(journeyFareGbp),
    airportFixedCostsGbp: money(airportFixedCostsGbp),
    nightWeekendSurchargeGbp: money(nightWeekendSurchargeGbp),
    transferAmountGbp: money(transferAmountGbp),
    distanceKm,
    durationMinutes,
  };
}

export async function signQuoteReceipt(
  input: Omit<QuoteReceiptClaims, "exp">,
  secret: string,
  nowMs: number,
): Promise<string> {
  const claims: QuoteReceiptClaims = {
    ...input,
    pickupPlaceId: normalizeReceiptText(input.pickupPlaceId),
    dropoffPlaceId: normalizeReceiptText(input.dropoffPlaceId),
    pickupAddress: normalizeReceiptText(input.pickupAddress),
    dropoffAddress: normalizeReceiptText(input.dropoffAddress),
    vehicleType: normalizeReceiptText(input.vehicleType),
    outboundDate: normalizeReceiptText(input.outboundDate),
    outboundTime: normalizeReceiptText(input.outboundTime),
    returnDate: input.returnJourney ? normalizeReceiptText(input.returnDate) : "",
    returnTime: input.returnJourney ? normalizeReceiptText(input.returnTime) : "",
    journeyFareGbp: money(input.journeyFareGbp),
    airportFixedCostsGbp: money(input.airportFixedCostsGbp),
    nightWeekendSurchargeGbp: money(input.nightWeekendSurchargeGbp),
    transferAmountGbp: money(input.transferAmountGbp),
    exp: Math.floor(nowMs / 1000) + QUOTE_RECEIPT_TTL_SECONDS,
  };
  const body = canonicalClaims(claims);
  const signature = await hmacSha256(secret, body);
  return `v1.${bytesToBase64Url(new TextEncoder().encode(body))}.${bytesToBase64Url(signature)}`;
}

export async function verifyQuoteReceipt(
  token: unknown,
  secret: string,
  nowMs: number,
): Promise<{ ok: true; claims: QuoteReceiptClaims } | { ok: false; reason: string }> {
  if (typeof token !== "string" || !token.trim()) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) {
    return { ok: false, reason: "malformed" };
  }
  const payloadBytes = base64UrlToBytes(parts[1]);
  const signatureBytes = base64UrlToBytes(parts[2]);
  if (!payloadBytes || !signatureBytes) return { ok: false, reason: "malformed" };
  const payload = new TextDecoder().decode(payloadBytes);
  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(expected, signatureBytes)) return { ok: false, reason: "bad_signature" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const claims = readClaims(parsed);
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.exp <= Math.floor(nowMs / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export function quoteReceiptJourneyMatches(
  claims: QuoteReceiptClaims,
  expected: QuoteReceiptJourney,
): boolean {
  if (claims.pricingVersion !== expected.pricingVersion) return false;
  if (normalizeReceiptText(claims.pickupPlaceId) !== normalizeReceiptText(expected.pickupPlaceId)) return false;
  if (normalizeReceiptText(claims.dropoffPlaceId) !== normalizeReceiptText(expected.dropoffPlaceId)) return false;
  if (canonicalJourneyEndpoint(claims.pickupAddress) !== canonicalJourneyEndpoint(expected.pickupAddress)) {
    return false;
  }
  if (canonicalJourneyEndpoint(claims.dropoffAddress) !== canonicalJourneyEndpoint(expected.dropoffAddress)) {
    return false;
  }
  if (normalizeReceiptText(claims.vehicleType) !== normalizeReceiptText(expected.vehicleType)) return false;
  if (claims.passengers !== expected.passengers || claims.suitcases !== expected.suitcases) return false;
  if (normalizeReceiptText(claims.outboundDate) !== normalizeReceiptText(expected.outboundDate)) return false;
  if (normalizeReceiptText(claims.outboundTime) !== normalizeReceiptText(expected.outboundTime)) return false;
  if (claims.returnJourney !== expected.returnJourney) return false;
  if (expected.returnJourney) {
    if (normalizeReceiptText(claims.returnDate) !== normalizeReceiptText(expected.returnDate)) return false;
    if (normalizeReceiptText(claims.returnTime) !== normalizeReceiptText(expected.returnTime)) return false;
  }
  return true;
}

/**
 * Protection off: ignore any token and keep the existing payment re-quote.
 * Protection on: accept only a valid receipt for this journey and pricing version.
 * Never recalculate a replacement fare here.
 */
export async function decideQuoteReceiptPayment(input: {
  protectionActive: boolean;
  secret: string | null | undefined;
  token: unknown;
  nowMs: number;
  expected: QuoteReceiptJourney;
}): Promise<QuoteReceiptDecision> {
  if (!input.protectionActive) return { action: "not_required" };
  const secret = input.secret?.trim() ?? "";
  if (!secret) return { action: "refresh", reason: "secret_missing" };
  const verified = await verifyQuoteReceipt(input.token, secret, input.nowMs);
  if (!verified.ok) return { action: "refresh", reason: verified.reason };
  if (verified.claims.pricingVersion !== input.expected.pricingVersion) {
    return { action: "refresh", reason: "pricing_version" };
  }
  if (!quoteReceiptJourneyMatches(verified.claims, input.expected)) {
    return { action: "refresh", reason: "journey_mismatch" };
  }
  return { action: "accept", claims: verified.claims };
}
