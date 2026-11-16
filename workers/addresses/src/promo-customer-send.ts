/**
 * Owner Dashboard → "Send codes to my customer list" (owner, 16 Nov 2026).
 *
 *   GET  /owner/promo/customers        — past customers from paid bookings, with who can get a code
 *   POST /owner/promo/customers/send   — { emails[], validityDays?, confirm: true } → own code each
 *        { test: true, testEmail? }    — sample email (sample code, nothing stored) to the owner
 *
 * Every customer gets their own email-bound code (same rules as the website codes: one use,
 * minimum fare, excluded dates). Batches of up to CUSTOMER_OFFER_BATCH_MAX per request; the
 * dashboard loops. Each email carries a one-click unsubscribe that never adds anyone to the
 * opt-in marketing list. Preview Worker: no email is sent, codes are returned on screen.
 */
import {
  CUSTOMER_OFFER_BATCH_MAX,
  CUSTOMER_OFFER_DEFAULT_VALIDITY_DAYS,
  CUSTOMER_OFFER_HARD_EXCLUSIONS,
  CUSTOMER_OFFER_SAMPLE_CODE,
  CUSTOMER_OFFER_SOURCE,
  CUSTOMER_OFFER_TEST_TO_DEFAULT,
  buildCustomerOfferEmail,
  customersFromBookings,
  isOwnerAddress,
  type CustomerOfferBooking,
  type CustomerOfferCandidate,
  type CustomerOfferExclusion,
} from "../shared/promo-customer-offer";
import { PROMO_LIMITS, normalizePromoEmail, promoExpiresAt } from "../shared/promo-code";
import { isOwnerOperationalTestBooking } from "../shared/upcoming-jobs";
import { ensureCustomerUnsubscribeToken, isMarketingOptedOut } from "./marketing-store";
import { listRecentPaidBookings } from "./paid-booking-store";
import {
  expireStalePromoCodes,
  getPromoSettings,
  issueOrResendPromoCode,
  markPromoEmailSent,
  promoEmailHash,
  withdrawUnsentPromoCode,
  type PromoDb,
} from "./promo-store";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

export type CustomerSendEnv = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  PROMO_HASH_SECRET?: string;
  PROMO_PREVIEW_MODE?: string;
  SITE_ORIGIN?: string;
};

export type CustomerOfferRow = CustomerOfferCandidate & {
  exclusions: CustomerOfferExclusion[];
  /** Can be sent if ticked (no hard exclusion). */
  sendable: boolean;
  /** Ticked by default in the dashboard (sendable and not cancelled/refunded). */
  suggested: boolean;
};

/** Resend allows a couple of requests a second; keep well under it. */
const SEND_GAP_MS = 600;

type Sleep = (ms: number) => Promise<void>;
let sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Tests only. */
export function setCustomerSendSleepForTests(next: Sleep | null): void {
  sleep = next ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

function ownerEmails(env: CustomerSendEnv): string[] {
  return [env.BOOKING_TO_EMAIL, env.BOOKING_NOTIFICATION_EMAIL, env.OWNER_EMAIL_COPY_ADDRESS]
    .map((x) => x?.trim() ?? "")
    .filter(Boolean);
}

async function codeHistoryExclusion(db: PromoDb, emailHash: string): Promise<CustomerOfferExclusion | null> {
  const rows = await db.prepare("SELECT status FROM promo_codes WHERE email_hash = ?").bind(emailHash).all<{ status: string }>();
  const statuses = (rows.results ?? []).map((r) => r.status);
  if (statuses.includes("redeemed")) return "already_used_code";
  if (statuses.includes("deactivated")) return "blocked_code";
  if (statuses.includes("active") || statuses.includes("reserved")) return "has_active_code";
  return null;
}

export async function classifyCustomer(
  env: CustomerSendEnv,
  db: PromoDb,
  candidate: CustomerOfferCandidate,
): Promise<CustomerOfferRow> {
  const exclusions: CustomerOfferExclusion[] = [];
  if (isOwnerAddress(candidate.email, ownerEmails(env))) exclusions.push("owner_address");
  if (candidate.refundedOrCancelled) exclusions.push("refunded_or_cancelled");
  if (env.TRACKING_STORE && (await isMarketingOptedOut(env.TRACKING_STORE, candidate.email))) exclusions.push("unsubscribed");
  const history = await codeHistoryExclusion(db, await promoEmailHash(candidate.email, env.PROMO_HASH_SECRET?.trim() ?? ""));
  if (history) exclusions.push(history);
  const sendable = !exclusions.some((e) => CUSTOMER_OFFER_HARD_EXCLUSIONS.has(e));
  return { ...candidate, exclusions, sendable, suggested: sendable && !exclusions.includes("refunded_or_cancelled") };
}

export async function listCustomerOfferRows(env: CustomerSendEnv, db: PromoDb, now: Date): Promise<CustomerOfferRow[]> {
  if (!env.TRACKING_STORE) return [];
  await expireStalePromoCodes(db, now);
  const bookings = (await listRecentPaidBookings(env.TRACKING_STORE, { days: 90, limit: 200 })).filter(
    (b) => !isOwnerOperationalTestBooking(b),
  );
  const candidates = customersFromBookings(bookings as unknown as CustomerOfferBooking[]);
  const rows: CustomerOfferRow[] = [];
  for (const c of candidates) rows.push(await classifyCustomer(env, db, c));
  return rows;
}

export type CustomerSendResult = {
  email: string;
  outcome: "sent" | "preview" | "skipped" | "failed";
  code?: string;
  reason?: string;
};

export function clampValidityDays(input: unknown): number {
  const n = Math.round(Number(input));
  if (!Number.isFinite(n) || n <= 0) return CUSTOMER_OFFER_DEFAULT_VALIDITY_DAYS;
  return Math.min(PROMO_LIMITS.maxValidityDays, Math.max(PROMO_LIMITS.minValidityDays, n));
}

export async function sendCustomerOffers(
  env: CustomerSendEnv,
  db: PromoDb,
  input: { emails: string[]; validityDays: number; now: Date; siteUrl: string },
): Promise<{ results: CustomerSendResult[]; expiresAt: string }> {
  const preview = env.PROMO_PREVIEW_MODE === "1";
  const store = env.TRACKING_STORE;
  const settings = await getPromoSettings(db);
  const offerSettings = { ...settings, validityDays: input.validityDays };
  const expiresAt = promoExpiresAt(input.now, input.validityDays).toISOString();
  const secret = env.PROMO_HASH_SECRET?.trim() ?? "";

  // Only customers who really booked can be sent to: re-read the list server-side.
  const known = new Map((await listCustomerOfferRows(env, db, input.now)).map((r) => [r.email, r]));
  const results: CustomerSendResult[] = [];
  let sentSoFar = 0;
  for (const raw of input.emails) {
    const email = normalizePromoEmail(raw);
    const row = email ? known.get(email) : undefined;
    if (!email || !row) {
      results.push({ email: email || String(raw), outcome: "skipped", reason: "Not a past customer" });
      continue;
    }
    const hard = row.exclusions.find((e) => CUSTOMER_OFFER_HARD_EXCLUSIONS.has(e));
    if (hard) {
      results.push({ email, outcome: "skipped", reason: hard });
      continue;
    }
    const emailHash = await promoEmailHash(email, secret);
    const issued = await issueOrResendPromoCode(db, {
      email,
      emailHash,
      settings: offerSettings,
      now: input.now,
      source: CUSTOMER_OFFER_SOURCE,
      marketingOptIn: false,
    });
    if (issued.kind !== "issued") {
      results.push({ email, outcome: "skipped", reason: issued.kind });
      continue;
    }
    if (preview) {
      await markPromoEmailSent(db, issued.code, input.now);
      results.push({ email, outcome: "preview", code: issued.code });
      continue;
    }
    if (!store) {
      await withdrawUnsentPromoCode(db, issued.code);
      results.push({ email, outcome: "failed", reason: "Booking store not configured" });
      continue;
    }
    if (sentSoFar > 0) await sleep(SEND_GAP_MS);
    const token = await ensureCustomerUnsubscribeToken(store, email);
    const message = buildCustomerOfferEmail({
      ...issued,
      name: row.name,
      hasExcludedDates: settings.blackoutDates.length > 0,
      unsubscribeUrl: `${input.siteUrl}/unsubscribe/?t=${token}`,
      siteUrl: input.siteUrl,
    });
    const sent = await trySendResendOnlyCustomerEmail(env, {
      to: email,
      toName: row.name || undefined,
      subject: message.subject,
      body: message.text,
      htmlBody: message.html,
      ownerCopy: false,
      idempotencyKey: `promo-cust-${issued.code}`,
    });
    sentSoFar += 1;
    if (!sent.sent) {
      await withdrawUnsentPromoCode(db, issued.code);
      results.push({ email, outcome: "failed", reason: sent.error || "Email could not be sent" });
      continue;
    }
    await markPromoEmailSent(db, issued.code, input.now);
    results.push({ email, outcome: "sent", code: issued.code });
  }
  return { results, expiresAt };
}

/** Owner's test copy: the real email layout with a sample code; nothing is stored. */
export async function sendCustomerOfferTest(
  env: CustomerSendEnv,
  db: PromoDb,
  input: { to: string; validityDays: number; now: Date; siteUrl: string },
): Promise<{ sent: boolean; error?: string }> {
  const settings = await getPromoSettings(db);
  const message = buildCustomerOfferEmail({
    code: CUSTOMER_OFFER_SAMPLE_CODE,
    expiresAt: promoExpiresAt(input.now, input.validityDays).toISOString(),
    discountRate: settings.discountRate,
    minimumVehicleFareGbp: settings.minimumVehicleFareGbp,
    name: "Colin",
    hasExcludedDates: settings.blackoutDates.length > 0,
    unsubscribeUrl: `${input.siteUrl}/unsubscribe/`,
    siteUrl: input.siteUrl,
  });
  if (env.PROMO_PREVIEW_MODE === "1") return { sent: true };
  const result = await trySendResendOnlyCustomerEmail(env, {
    to: input.to,
    subject: `[Test] ${message.subject}`,
    body: message.text,
    htmlBody: message.html,
    ownerCopy: false,
  });
  return { sent: result.sent, error: result.error };
}

export function customerOfferTestAddress(env: CustomerSendEnv, requested: unknown): string {
  const asked = normalizePromoEmail(requested);
  if (asked) return asked;
  return (
    normalizePromoEmail(env.BOOKING_NOTIFICATION_EMAIL) ||
    normalizePromoEmail(env.BOOKING_TO_EMAIL) ||
    CUSTOMER_OFFER_TEST_TO_DEFAULT
  );
}

export { CUSTOMER_OFFER_BATCH_MAX };
