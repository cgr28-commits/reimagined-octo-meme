/**
 * KV storage for the customer "My bookings" area.
 *
 * Keys (all on TRACKING_STORE, emails are SHA-256 hashed so raw addresses never appear in key names):
 *   customer:bookings:<emailHash>   → payment references booked with that email (index)
 *   customer:code:<emailHash>       → pending sign-in code (hashed), expiry, attempts
 *   customer:code-rate:<emailHash>  → codes sent this hour
 *   customer:ip-rate:<ipHash>       → code requests from one IP this hour
 *   customer:session:<tokenHash>    → signed-in session (email)
 */
import {
  CUSTOMER_LOGIN_CODE_TTL_SECONDS,
  CUSTOMER_LOGIN_MAX_CODES_PER_HOUR,
  CUSTOMER_LOGIN_MAX_REQUESTS_PER_IP_PER_HOUR,
  CUSTOMER_LOGIN_MAX_VERIFY_ATTEMPTS,
  CUSTOMER_SESSION_TTL_SECONDS,
  normalizeCustomerEmail,
  normalizeCustomerLoginCode,
  normalizeCustomerSessionToken,
  type CustomerBookingStatus,
  type CustomerBookingSummary,
  type CustomerProfile,
} from "../shared/customer-account";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { isOwnerOperationalTestBooking } from "../shared/upcoming-jobs";

const INDEX_TTL = 60 * 60 * 24 * 400;
const MAX_INDEXED_BOOKINGS = 200;
export const CUSTOMER_INDEX_BACKFILL_FLAG = "customer:bookings:backfilled-v1";

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function customerEmailHash(email: string): Promise<string> {
  return sha256Hex(`customer-email:${normalizeCustomerEmail(email)}`);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0]! % 1_000_000).padStart(6, "0");
}

/** Add a paid booking to its customer's email index. Safe to call on every save. */
export async function indexPaidBookingForCustomer(
  store: KVNamespace,
  record: Pick<PaidBookingRecord, "customerEmail" | "paymentReference">,
): Promise<void> {
  const email = normalizeCustomerEmail(record.customerEmail);
  const ref = record.paymentReference?.trim();
  if (!email || !ref) return;
  const key = `customer:bookings:${await customerEmailHash(email)}`;
  const existing = await store.get<string[]>(key, "json");
  const refs = Array.isArray(existing) ? existing : [];
  if (refs.includes(ref)) return;
  refs.push(ref);
  await store.put(key, JSON.stringify(refs.slice(-MAX_INDEXED_BOOKINGS)), {
    expirationTtl: INDEX_TTL,
  });
}

export async function listCustomerBookingRefs(store: KVNamespace, email: string): Promise<string[]> {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) return [];
  const refs = await store.get<string[]>(`customer:bookings:${await customerEmailHash(normalized)}`, "json");
  return Array.isArray(refs) ? refs.filter((r) => typeof r === "string" && r.trim()) : [];
}

/** Hourly counter; returns false when the limit is already reached. */
async function takeRateSlot(store: KVNamespace, key: string, limit: number): Promise<boolean> {
  const current = Number((await store.get(key)) ?? "0") || 0;
  if (current >= limit) return false;
  await store.put(key, String(current + 1), { expirationTtl: 60 * 60 });
  return true;
}

export type IssueCodeResult =
  | { issued: true; code: string }
  | { issued: false; reason: "no_bookings" | "rate_limited" | "invalid_email" };

/**
 * Create a sign-in code for an email that has booked with us. The caller emails it.
 * Rate limited per email and per IP. Emails with no bookings get no code.
 */
export async function issueCustomerLoginCode(
  store: KVNamespace,
  rawEmail: string,
  ip: string,
): Promise<IssueCodeResult> {
  const email = normalizeCustomerEmail(rawEmail);
  if (!email) return { issued: false, reason: "invalid_email" };
  const ipKey = `customer:ip-rate:${await sha256Hex(`customer-ip:${ip || "unknown"}`)}`;
  if (!(await takeRateSlot(store, ipKey, CUSTOMER_LOGIN_MAX_REQUESTS_PER_IP_PER_HOUR))) {
    return { issued: false, reason: "rate_limited" };
  }
  const refs = await listCustomerBookingRefs(store, email);
  if (!refs.length) return { issued: false, reason: "no_bookings" };
  const emailHash = await customerEmailHash(email);
  if (!(await takeRateSlot(store, `customer:code-rate:${emailHash}`, CUSTOMER_LOGIN_MAX_CODES_PER_HOUR))) {
    return { issued: false, reason: "rate_limited" };
  }
  const code = randomCode();
  const salt = randomHex(16);
  await store.put(
    `customer:code:${emailHash}`,
    JSON.stringify({
      salt,
      codeHash: await sha256Hex(`${salt}:${code}`),
      expiresAt: Date.now() + CUSTOMER_LOGIN_CODE_TTL_SECONDS * 1000,
      attempts: 0,
    }),
    { expirationTtl: CUSTOMER_LOGIN_CODE_TTL_SECONDS },
  );
  return { issued: true, code };
}

export type VerifyCodeResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/** Check a code; on success the code is used up and a 30-day session token is returned. */
export async function verifyCustomerLoginCode(
  store: KVNamespace,
  rawEmail: string,
  rawCode: string,
): Promise<VerifyCodeResult> {
  const email = normalizeCustomerEmail(rawEmail);
  const code = normalizeCustomerLoginCode(rawCode);
  if (!email || !code) return { ok: false, reason: "invalid" };
  const emailHash = await customerEmailHash(email);
  const key = `customer:code:${emailHash}`;
  const pending = await store.get<{ salt: string; codeHash: string; expiresAt: number; attempts: number }>(
    key,
    "json",
  );
  if (!pending) return { ok: false, reason: "expired" };
  if (Date.now() > pending.expiresAt) {
    await store.delete(key);
    return { ok: false, reason: "expired" };
  }
  if (pending.attempts >= CUSTOMER_LOGIN_MAX_VERIFY_ATTEMPTS) {
    await store.delete(key);
    return { ok: false, reason: "too_many_attempts" };
  }
  if ((await sha256Hex(`${pending.salt}:${code}`)) !== pending.codeHash) {
    const attempts = pending.attempts + 1;
    if (attempts >= CUSTOMER_LOGIN_MAX_VERIFY_ATTEMPTS) {
      await store.delete(key);
      return { ok: false, reason: "too_many_attempts" };
    }
    const ttl = Math.max(60, Math.ceil((pending.expiresAt - Date.now()) / 1000));
    await store.put(key, JSON.stringify({ ...pending, attempts }), { expirationTtl: ttl });
    return { ok: false, reason: "invalid" };
  }
  await store.delete(key);
  const token = randomHex(32);
  await store.put(
    `customer:session:${await sha256Hex(`customer-session:${token}`)}`,
    JSON.stringify({ email, createdAt: new Date().toISOString() }),
    { expirationTtl: CUSTOMER_SESSION_TTL_SECONDS },
  );
  return { ok: true, token };
}

export async function getCustomerSessionEmail(store: KVNamespace, rawToken: string): Promise<string | null> {
  const token = normalizeCustomerSessionToken(rawToken);
  if (!token) return null;
  const session = await store.get<{ email: string }>(
    `customer:session:${await sha256Hex(`customer-session:${token}`)}`,
    "json",
  );
  return session?.email ? normalizeCustomerEmail(session.email) || null : null;
}

export async function endCustomerSession(store: KVNamespace, rawToken: string): Promise<void> {
  const token = normalizeCustomerSessionToken(rawToken);
  if (!token) return;
  await store.delete(`customer:session:${await sha256Hex(`customer-session:${token}`)}`);
}

function londonNowKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function customerBookingStatus(record: PaidBookingRecord, now: Date = new Date()): CustomerBookingStatus {
  if (
    record.operationalStatus === "cancelled" ||
    record.status === "cancelled" ||
    record.status === "refunded"
  ) {
    return "cancelled";
  }
  const lastDate = record.returnJourney && record.returnDate ? record.returnDate : record.tripDate;
  const lastTime = record.returnJourney && record.returnDate ? record.returnTime || "23:59" : record.tripTime || "23:59";
  const lastLeg = `${lastDate}T${lastTime}`;
  // Still "upcoming" until 3 hours after the last pickup.
  const cutoff = londonNowKey(new Date(now.getTime() - 3 * 60 * 60 * 1000));
  return lastLeg >= cutoff ? "upcoming" : "completed";
}

function finite(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function toCustomerBookingSummary(
  record: PaidBookingRecord,
  options: { siteUrl: string; now?: Date },
): CustomerBookingSummary {
  const site = options.siteUrl.replace(/\/$/, "");
  return {
    reference: record.customerReference || record.paymentReference,
    status: customerBookingStatus(record, options.now),
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    returnJourney: Boolean(record.returnJourney),
    ...(record.returnJourney && record.returnDate
      ? { returnDate: record.returnDate, returnTime: record.returnTime }
      : {}),
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    ...(record.pickupPlaceId ? { pickupPlaceId: record.pickupPlaceId } : {}),
    ...(record.dropoffPlaceId ? { dropoffPlaceId: record.dropoffPlaceId } : {}),
    ...(finite(record.pickupLat) != null ? { pickupLat: finite(record.pickupLat) } : {}),
    ...(finite(record.pickupLng) != null ? { pickupLng: finite(record.pickupLng) } : {}),
    ...(finite(record.dropoffLat) != null ? { dropoffLat: finite(record.dropoffLat) } : {}),
    ...(finite(record.dropoffLng) != null ? { dropoffLng: finite(record.dropoffLng) } : {}),
    ...(typeof record.passengers === "number" ? { passengers: record.passengers } : {}),
    ...(typeof record.suitcases === "number" ? { suitcases: record.suitcases } : {}),
    ...(typeof record.childSeats === "number" && record.childSeats > 0 ? { childSeats: record.childSeats } : {}),
    ...(record.vehicle ? { vehicle: record.vehicle } : {}),
    ...(record.flightNumber ? { flightNumber: record.flightNumber } : {}),
    ...(finite(record.totalFare ?? record.amount) != null ? { totalFare: finite(record.totalFare ?? record.amount) } : {}),
    ...(record.manageBookingToken
      ? { manageUrl: `${site}/manage-booking/?token=${encodeURIComponent(record.manageBookingToken)}` }
      : {}),
  };
}

/** Profile from the customer's most recent booking (name + mobile they last used). */
export function customerProfileFromRecords(email: string, records: PaidBookingRecord[]): CustomerProfile {
  const latest = [...records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  return {
    email,
    name: latest?.customerName?.trim() ?? "",
    mobile: latest?.mobileNumber?.trim() ?? "",
  };
}

/** Records for an email, excluding owner test bookings and records whose email has since changed. */
export async function loadCustomerRecords(
  store: KVNamespace,
  email: string,
  getRecord: (ref: string) => Promise<PaidBookingRecord | null>,
): Promise<PaidBookingRecord[]> {
  const refs = await listCustomerBookingRefs(store, email);
  const records: PaidBookingRecord[] = [];
  for (const ref of refs) {
    const record = await getRecord(ref);
    if (!record) continue;
    if (normalizeCustomerEmail(record.customerEmail) !== email) continue;
    if (isOwnerOperationalTestBooking(record)) continue;
    records.push(record);
  }
  return records;
}
